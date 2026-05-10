// Analyze PDF via Lovable AI Gateway (Gemini 2.5 Pro)
// Returns structured JSON: summary, key_insights[], alerts[], extracted_items[]
// Items are typed for the target module so the client can "pour" them in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODULE_HINTS: Record<string, string> = {
  alimentation:
    "Inventaire alimentaire (frigo, garde-manger). Pour chaque produit détecté, fournir name, category (ex: produit_laitier, viande, légume, boisson, conserve), quantity (entier), unit, expiration_date (YYYY-MM-DD si trouvée).",
  pharmacie:
    "Médicaments / pharmacie. Pour chaque produit: name, category (ex: antalgique, antibiotique, vitamine), quantity, unit (ex: comprimé, ml), expiration_date.",
  habits:
    "Vêtements / garde-robe. Pour chaque article: name, category (haut, bas, chaussure, accessoire), quantity, unit, location.",
  menager:
    "Produits ménagers. Pour chaque produit: name, category (entretien, hygiène, papier), quantity, unit.",
  nutrition:
    "Données nutritionnelles. Pour chaque aliment / repas: name, meal (petit-dejeuner|dejeuner|diner|collation), calories, proteins, carbs, fats. date au format YYYY-MM-DD si présente.",
  fitness:
    "Programme de séances. Pour chaque séance: name (séance), date YYYY-MM-DD si trouvée, duration_minutes, exercises[] avec {name, sets, reps, weight}.",
  body:
    "Mesures corporelles. Pour chaque relevé: date YYYY-MM-DD, weight, body_fat, muscle_mass, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh.",
  documents: "Document générique : extraire le maximum de données structurées.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) throw new Error("Non authentifié");

    const { storage_path, module, name } = await req.json();
    if (!storage_path || !module) throw new Error("storage_path & module requis");

    // Download PDF from private bucket
    const { data: file, error: dlErr } = await supa.storage
      .from("pdf-documents")
      .download(storage_path);
    if (dlErr || !file) throw new Error(`Téléchargement PDF échoué: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);

    const hint = MODULE_HINTS[module] ?? MODULE_HINTS.documents;
    const systemPrompt = `Tu es un analyste expert. Tu reçois un PDF. Module cible: "${module}".
${hint}
Retourne STRICTEMENT du JSON conforme au schéma fourni via tool calling.
Si le PDF ne contient pas d'éléments pertinents pour le module, retourne extracted_items: [].
Tout le texte (summary, insights, alerts) doit être en FRANÇAIS.`;

    const tool = {
      type: "function",
      function: {
        name: "save_analysis",
        description: "Enregistrer l'analyse structurée du PDF",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Résumé en 2-3 phrases" },
            key_insights: { type: "array", items: { type: "string" }, description: "3 à 6 points clés" },
            alerts: { type: "array", items: { type: "string" }, description: "Alertes / points d'attention" },
            extracted_items: {
              type: "array",
              description: "Données structurées extraites pour le module cible",
              items: { type: "object", additionalProperties: true },
            },
          },
          required: ["summary", "key_insights", "alerts", "extracted_items"],
          additionalProperties: false,
        },
      },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Analyse ce PDF intitulé "${name ?? "document"}" pour le module "${module}".` },
              {
                type: "file",
                file: { filename: name ?? "document.pdf", file_data: `data:application/pdf;base64,${b64}` },
              },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_analysis" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Limite de requêtes atteinte. Réessayez dans un instant.");
      if (aiRes.status === 402) throw new Error("Crédits IA épuisés.");
      throw new Error(`Gateway IA: ${aiRes.status} ${txt.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Pas de réponse structurée IA");
    const parsed = JSON.parse(call.function.arguments);

    return new Response(
      JSON.stringify({
        summary: parsed.summary ?? "",
        key_insights: parsed.key_insights ?? [],
        alerts: parsed.alerts ?? [],
        extracted_items: parsed.extracted_items ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
