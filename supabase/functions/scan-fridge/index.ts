// Scanne une photo (frigo, placard, armoire, etc.) via Lovable AI Gateway
// Renvoie une liste d'items détectés au format du module cible.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_ORIGINS = [
  "https://id-preview--2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovable.app",
  "https://2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovableproject.com",
  "https://project--2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovable.app",
  "https://cortex-home-ai.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
];

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

const MODULE_HINTS: Record<string, string> = {
  alimentation:
    "Inventaire alimentaire (frigo, garde-manger). Identifie chaque produit visible : name (FR), category (produit_laitier, viande, légume, fruit, boisson, conserve, sauce, féculent, surgelé, autre), quantity (entier estimé), unit (ex: bouteille, pot, paquet), location (Frigo / Congélateur / Placard si déductible), expiration_date YYYY-MM-DD UNIQUEMENT si la date est lisible sur l'étiquette.",
  pharmacie:
    "Identifie chaque médicament/produit pharmaceutique visible : name (marque + dosage si lisible), category (antalgique, antibiotique, vitamine, sirop, autre), quantity, unit (boîte, comprimé, ml), expiration_date si lisible.",
  habits:
    "Identifie chaque vêtement visible : name (ex: T-shirt blanc), category (haut, bas, chaussure, accessoire, sous-vêtement), quantity, location si déductible.",
  menager:
    "Identifie chaque produit ménager visible : name, category (entretien, hygiène, papier, lessive), quantity, unit.",
};

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (publicMsg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[scan-fridge]", publicMsg, internal);
    return new Response(JSON.stringify({ error: publicMsg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return fail("Service indisponible", 500, "LOVABLE_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const { image_base64, mime_type, module } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") return fail("Image manquante", 400);
    if (!module || !MODULE_HINTS[module]) return fail("Module invalide", 400);
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse", 413);

    const mt = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

    const itemSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        category: { type: "string" },
        quantity: { type: "number" },
        unit: { type: "string" },
        location: { type: "string" },
        expiration_date: { type: "string", description: "YYYY-MM-DD si lisible" },
        confidence: { type: "number", description: "0..1 confiance dans l'identification" },
      },
      required: ["name"],
    };

    const tool = {
      type: "function",
      function: {
        name: "save_scan",
        description: "Enregistrer la liste d'items détectés sur la photo",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Résumé court (1 phrase)" },
            extracted_items: {
              type: "array",
              description: "Items détectés. Si rien d'identifiable, []",
              items: itemSchema,
            },
          },
          required: ["summary", "extracted_items"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `Tu es un expert en reconnaissance visuelle d'inventaire. Module cible: "${module}".
${MODULE_HINTS[module]}
Règles strictes :
- Liste UNIQUEMENT ce que tu vois clairement sur la photo, en FRANÇAIS.
- N'invente RIEN. Mieux vaut omettre un item que d'halluciner.
- Si plusieurs exemplaires identiques sont visibles, mets-les sur UNE ligne avec quantity = nombre estimé.
- N'écris une expiration_date que si la date est explicitement LISIBLE sur l'étiquette.
- confidence : 0.9+ certain, 0.6-0.9 probable, <0.6 ne pas inclure.
- Retourne STRICTEMENT du JSON via tool calling.`;

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
              { type: "text", text: `Identifie tous les items visibles sur cette photo pour le module "${module}".` },
              { type: "image_url", image_url: { url: `data:${mt};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_scan" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429)
        return fail("Limite de requêtes atteinte. Réessayez dans un instant.", 429);
      if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
      return fail("Erreur d'analyse IA", 502, `${aiRes.status} ${txt.slice(0, 500)}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fail("Réponse IA invalide", 502);
    const parsed = JSON.parse(call.function.arguments);

    return new Response(
      JSON.stringify({
        summary: parsed.summary ?? "",
        extracted_items: Array.isArray(parsed.extracted_items) ? parsed.extracted_items : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return fail("Erreur lors du scan", 500, e);
  }
});
