// Analyse une photo de repas → estime calories + macros via IA.
// Tente LOVABLE_API_KEY (Gemini 2.5 Pro) puis OPENAI_API_KEY (GPT-4o) en fallback.
// Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." }.
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealResult {
  name: string;
  meal?: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  confidence?: number;
  details?: string;
}

// ─── Tool definition (OpenAI / Gemini via Lovable) ────────────────────────────

const MEAL_TOOL = {
  type: "function",
  function: {
    name: "save_meal",
    description: "Enregistrer l'analyse nutritionnelle du repas",
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
        calories: { type: "number", description: "Calories totales estimées (kcal)" },
        proteins: { type: "number", description: "Protéines totales estimées (g)" },
        carbs: { type: "number", description: "Glucides totaux estimés (g)" },
        fats: { type: "number", description: "Lipides totaux estimés (g)" },
        confidence: {
          type: "number",
          description: "Niveau de confiance 0..1",
        },
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

const SYSTEM_PROMPT = `Tu es un nutritionniste expert en analyse visuelle de repas.
Identifie les aliments visibles, estime leurs portions (grammes) et calcule les TOTAUX kcal/protéines/glucides/lipides du repas entier.

Méthode :
1. Liste mentalement chaque aliment visible et estime sa masse en grammes (repères : assiette ~25 cm, fourchette ~20 cm, verre ~25 cl).
2. Pour chaque aliment : applique les valeurs nutritionnelles standard /100 g (table CIQUAL).
3. Additionne pour obtenir les totaux du repas.
4. Si un aliment est ambigu, prends la moyenne raisonnable et baisse confidence.
5. Retourne STRICTEMENT du JSON via tool calling. Tout le texte en FRANÇAIS.`;

// ─── Parser robuste de la réponse IA ─────────────────────────────────────────

function extractMealFromAiResponse(aiJson: unknown): MealResult | null {
  // Chemin 1 : tool_calls standard (OpenAI + Lovable gateway)
  const calls = (aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> })
    ?.choices?.[0]?.message?.tool_calls;
  if (calls && calls.length > 0) {
    const tc = calls[0];
    try {
      const p = JSON.parse(tc.function.arguments);
      if (typeof p?.calories === "number") {
        console.log("[scan-meal] parsed via tool_call:", p.name, p.calories, "kcal");
        return p as MealResult;
      }
    } catch (e) {
      console.warn("[scan-meal] tool_call JSON parse failed:", e);
    }
  }

  // Chemin 2 : contenu textuel — certains gateways peuvent retourner du JSON dans content
  const rawContent = (aiJson as { choices?: Array<{ message?: { content?: string | unknown[] } }> })
    ?.choices?.[0]?.message?.content;
  const text =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
      ? (rawContent as Array<{ text?: string }>).map((c) => c?.text ?? "").join("")
      : "";

  if (text) {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        if (typeof p?.calories === "number") {
          console.log("[scan-meal] parsed via content fallback:", p.name, p.calories, "kcal");
          return p as MealResult;
        }
      } catch {/* ignore */}
    }
  }

  console.error("[scan-meal] extractMealFromAiResponse: aucun résultat parseable, raw:", JSON.stringify(aiJson).slice(0, 600));
  return null;
}

// ─── Appels IA ────────────────────────────────────────────────────────────────

async function callLovable(apiKey: string, b64: string, mt: string): Promise<unknown> {
  console.log("[scan-meal] → Lovable gateway (Gemini 2.5 Pro), b64 length:", b64.length);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse ce repas et estime kcal + macros totales." },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}` } },
          ],
        },
      ],
      tools: [MEAL_TOOL],
      tool_choice: { type: "function", function: { name: "save_meal" } },
    }),
  });

  console.log("[scan-meal] Lovable status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-meal] Lovable error body:", body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite Lovable atteinte");
    if (res.status === 402) throw new Error("Crédits Lovable épuisés");
    if (res.status === 401) throw new Error("Clé Lovable invalide");
    throw new Error(`Lovable ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  console.log("[scan-meal] Lovable response:", JSON.stringify(json).slice(0, 400));
  return json;
}

async function callOpenAI(apiKey: string, b64: string, mt: string): Promise<unknown> {
  console.log("[scan-meal] → OpenAI GPT-4o, b64 length:", b64.length);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse ce repas et estime kcal + macros totales." },
            {
              type: "image_url",
              image_url: { url: `data:${mt};base64,${b64}`, detail: "auto" },
            },
          ],
        },
      ],
      tools: [MEAL_TOOL],
      tool_choice: { type: "function", function: { name: "save_meal" } },
      max_tokens: 1024,
    }),
  });

  console.log("[scan-meal] OpenAI status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-meal] OpenAI error body:", body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite OpenAI atteinte — réessaie dans un instant");
    if (res.status === 402) throw new Error("Crédits OpenAI épuisés");
    if (res.status === 401) throw new Error("Clé OpenAI invalide");
    if (res.status === 400) throw new Error(`OpenAI 400 (requête invalide): ${body.slice(0, 200)}`);
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  console.log("[scan-meal] OpenAI response:", JSON.stringify(json).slice(0, 400));
  return json;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) {
      console.error("[scan-meal] FAIL:", userMsg, internalDetails);
    } else {
      console.warn("[scan-meal] FAIL:", userMsg);
    }
    return json200({ error: userMsg });
  };

  try {
    // ── Clés API ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    console.log("[scan-meal] START — keys:", {
      lovable: !!LOVABLE_API_KEY,
      openai: !!OPENAI_API_KEY,
    });

    if (!LOVABLE_API_KEY && !OPENAI_API_KEY) {
      return fail(
        "Service IA indisponible (aucune clé API configurée). Contacte le support.",
        "LOVABLE_API_KEY et OPENAI_API_KEY absentes"
      );
    }

    // ── Auth ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) {
      return fail("Non authentifié — reconnecte-toi.", userErr?.message);
    }
    console.log("[scan-meal] auth ok:", userData.user.id);

    // ── Rate limit ──
    const rl = await checkRateLimit(supa, userData.user.id, "scan_meal", 20);
    if (!rl.ok) {
      return fail(`Limite atteinte (${rl.count}/20 scans par heure). Réessaie plus tard.`);
    }

    // ── Parsing du body ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps de requête invalide (JSON attendu).", e instanceof Error ? e.message : String(e));
    }

    const { image_base64, mime_type } = body;

    if (!image_base64 || typeof image_base64 !== "string") {
      return fail("Champ image_base64 manquant ou invalide.");
    }
    if (image_base64.length < 100) {
      return fail("image_base64 trop court — image vide ou corrompue.");
    }
    console.log("[scan-meal] image_base64 length:", image_base64.length, "chars");

    if (image_base64.length > 12_000_000) {
      return fail("Image trop volumineuse (max ~9 Mo après compression). Réduis la qualité.");
    }

    const mt =
      typeof mime_type === "string" && mime_type.startsWith("image/")
        ? mime_type
        : "image/jpeg";
    console.log("[scan-meal] mime_type:", mt);

    // ── Appel IA avec fallback ──
    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callLovable(LOVABLE_API_KEY, image_base64, mt);
        console.log("[scan-meal] Lovable ok, ms:", Date.now() - t0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aiErrors.push(`Lovable: ${msg}`);
        console.error("[scan-meal] Lovable failed:", msg);
        aiJson = null;
      }
    }

    if (!aiJson && OPENAI_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callOpenAI(OPENAI_API_KEY, image_base64, mt);
        console.log("[scan-meal] OpenAI ok, ms:", Date.now() - t0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aiErrors.push(`OpenAI: ${msg}`);
        console.error("[scan-meal] OpenAI failed:", msg);
        aiJson = null;
      }
    }

    if (!aiJson) {
      return fail(
        aiErrors.some((e) => e.includes("Limite") || e.includes("épuisés"))
          ? "Limite d'utilisation IA atteinte. Réessaie dans quelques instants."
          : "Le service d'analyse IA est temporairement indisponible. Réessaie dans un instant.",
        aiErrors
      );
    }

    // ── Extraction du résultat ──
    const parsed = extractMealFromAiResponse(aiJson);
    if (!parsed || typeof parsed.calories !== "number") {
      return fail(
        "L'IA n'a pas pu analyser cette image. Essaie avec une photo plus nette, mieux éclairée et centrée sur le repas."
      );
    }

    // ── Sanity check des valeurs ──
    const safeNum = (v: unknown, fallback: number) =>
      typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : fallback;

    const result: MealResult = {
      name:       typeof parsed.name === "string" ? parsed.name.slice(0, 200) : "Repas analysé",
      meal:       ["petit-dej","dejeuner","diner","collation"].includes(parsed.meal ?? "")
                    ? parsed.meal
                    : "dejeuner",
      calories:   safeNum(parsed.calories, 0),
      proteins:   safeNum(parsed.proteins, 0),
      carbs:      safeNum(parsed.carbs, 0),
      fats:       safeNum(parsed.fats, 0),
      confidence: safeNum(parsed.confidence, 0.7),
      details:    typeof parsed.details === "string" ? parsed.details.slice(0, 500) : undefined,
    };

    console.log("[scan-meal] SUCCESS:", result.name, result.calories, "kcal", `(conf: ${result.confidence})`);

    await recordRateLimit(supa, userData.user.id, "scan_meal");

    return json200(result as unknown as Record<string, unknown>);

  } catch (e) {
    console.error("[scan-meal] unhandled exception:", e);
    return json200({
      error: "Erreur inattendue lors de l'analyse. Réessaie.",
    });
  }
});
