// Analyse une photo de repas et estime calories + macros via Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";

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

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (publicMsg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[scan-meal]", publicMsg, internal);
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

    const rl = await checkRateLimit(supa, userData.user.id, "scan_meal", 20);
    if (!rl.ok) return fail("Limite atteinte (20 scans/h). Réessaie plus tard.", 429);

    const { image_base64, mime_type } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") return fail("Image manquante", 400);
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse", 413);

    const mt =
      typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

    const tool = {
      type: "function",
      function: {
        name: "save_meal",
        description: "Enregistrer le repas analysé",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Nom court du repas en français (ex: 'Poulet riz brocolis')",
            },
            meal: {
              type: "string",
              enum: ["petit-dej", "dejeuner", "diner", "collation"],
              description: "Type de repas le plus probable selon le contenu",
            },
            calories: { type: "number", description: "Calories estimées totales du repas (kcal)" },
            proteins: { type: "number", description: "Protéines estimées totales (g)" },
            carbs: { type: "number", description: "Glucides estimés totaux (g)" },
            fats: { type: "number", description: "Lipides estimés totaux (g)" },
            confidence: { type: "number", description: "0..1 confiance dans l'estimation" },
            details: {
              type: "string",
              description: "1-2 phrases : composants identifiés et hypothèses de portion",
            },
          },
          required: ["name", "calories", "proteins", "carbs", "fats"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `Tu es un nutritionniste expert en analyse visuelle de repas.
Identifie les aliments visibles, estime leurs portions (en grammes) puis calcule TOTAUX kcal/protéines/glucides/lipides du repas entier.

Méthode :
1. Liste mentalement chaque aliment visible et estime sa masse en grammes (utilise les repères : assiette ~25cm, fourchette ~20cm, verre ~25cl).
2. Pour chaque aliment : applique les valeurs nutritionnelles standard /100g (CIQUAL).
3. Additionne pour le repas entier.
4. Si un aliment est ambigu (ex: sauce invisible), prends la moyenne raisonnable et baisse confidence.
5. Nom = description courte et claire en français.
6. meal = devine selon contenu (céréales/œufs → petit-dej, plat complet midi → dejeuner, etc.).

Retourne STRICTEMENT du JSON via tool calling.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse ce repas et estime kcal + macros totales." },
              { type: "image_url", image_url: { url: `data:${mt};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_meal" } },
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

    await recordRateLimit(supa, userData.user.id, "scan_meal");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de l'analyse", 500, e);
  }
});
