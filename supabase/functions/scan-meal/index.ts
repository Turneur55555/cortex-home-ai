// Analyse une photo de repas → retourne la liste de chaque aliment identifié avec ses macros.
// Tente GEMINI_API_KEY (Gemini 2.5 Flash) puis OPENAI_API_KEY (GPT-4o) en fallback.
// Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." }.
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";
import { MEAL_SLUGS, isMealSlug } from "../_shared/meals.ts";
import {
  MEAL_ITEM_SCHEMA,
  safeNum,
  sanitizeMealItem,
  type MealAnalysisResult,
} from "../_shared/meal-items.ts";

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed =
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  const allow = isAllowed ? origin : "https://cortex-home-ai.lovable.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
// MealItem / MealAnalysisResult (avec grams requis) : voir ../_shared/meal-items.ts

// ─── Tool definition ──────────────────────────────────────────────────────────

const MEAL_TOOL = {
  type: "function",
  function: {
    name: "save_meal",
    description: "Enregistrer la liste détaillée de chaque aliment identifié dans l'assiette",
    parameters: {
      type: "object",
      properties: {
        meal: {
          type: "string",
          enum: [...MEAL_SLUGS],
          description: "Type de repas le plus probable selon le contenu",
        },
        confidence: {
          type: "number",
          description: "Niveau de confiance global 0..1",
        },
        items: {
          type: "array",
          description: "Liste de chaque aliment ou groupe identifié séparément. Un aliment = une entrée.",
          items: MEAL_ITEM_SCHEMA,
          minItems: 1,
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Tu es un nutritionniste expert en analyse visuelle de repas.
Identifie CHAQUE aliment ou groupe d'aliments séparément : ne les regroupe jamais en un seul total.

Exemples corrects :
- Assiette de sushis → ["5 sushis saumon", "3 maki concombre", "wasabi"]
- Repas équilibré → ["Poulet grillé 150 g", "Riz blanc cuit 180 g", "Haricots verts 80 g"]
- Petit-déjeuner → ["Flocons d'avoine 60 g", "Lait demi-écrémé 150 ml", "Banane 120 g"]

Méthode par aliment :
1. Estime la masse en grammes (repères : assiette ~25 cm, fourchette ~20 cm).
2. Applique les valeurs /100 g de la table CIQUAL.
3. Calcule kcal + protéines + glucides + lipides pour cette masse estimée.
4. Renvoie aussi cette masse (grams) : c'est elle qui sera enregistrée comme poids de référence.

Si un aliment est ambigu, prends la valeur moyenne et baisse confidence.
Retourne STRICTEMENT du JSON via tool calling. Tout le texte en FRANÇAIS.`;

// ─── Parser robuste ───────────────────────────────────────────────────────────

function extractFromAiResponse(aiJson: unknown): MealAnalysisResult | null {
  // Chemin 1 : tool_calls standard
  const calls = (aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { arguments: string } }> } }> })
    ?.choices?.[0]?.message?.tool_calls;

  if (calls && calls.length > 0) {
    try {
      const p = JSON.parse(calls[0].function.arguments);
      // Format nouveau : { items: [...] }
      if (Array.isArray(p?.items) && p.items.length > 0) {
        console.log("[scan-meal] parsed items via tool_call:", p.items.length);
        return p as MealAnalysisResult;
      }
      // Ancien format : { name, calories, ... } → wrap pour rétrocompat
      if (typeof p?.calories === "number") {
        console.log("[scan-meal] fallback: old format wrapped as single item");
        return {
          items: [sanitizeMealItem(p)],
          meal: p.meal,
          confidence: p.confidence,
        };
      }
    } catch (e) {
      console.warn("[scan-meal] tool_call JSON parse failed:", e);
    }
  }

  // Chemin 2 : contenu textuel (certains gateways)
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
        if (Array.isArray(p?.items)) {
          console.log("[scan-meal] parsed items via content fallback:", p.items.length);
          return p as MealAnalysisResult;
        }
        if (typeof p?.calories === "number") {
          return {
            items: [sanitizeMealItem(p)],
            meal: p.meal,
            confidence: p.confidence,
          };
        }
      } catch {/* ignore */}
    }
  }

  console.error("[scan-meal] aucun résultat parseable, raw:", JSON.stringify(aiJson).slice(0, 600));
  return null;
}

// ─── Appels IA ────────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, b64: string, mt: string): Promise<unknown> {
  console.log("[scan-meal] → Gemini 2.5 Flash, b64 length:", b64.length);
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Identifie chaque aliment séparément et donne sa masse estimée (grammes) avec ses macros." },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}` } },
          ],
        },
      ],
      tools: [MEAL_TOOL],
      tool_choice: { type: "function", function: { name: "save_meal" } },
    }),
  });

  console.log("[scan-meal] Gemini status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-meal] Gemini error:", body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite Gemini atteinte");
    if (res.status === 402) throw new Error("Crédits Gemini épuisés");
    if (res.status === 401) throw new Error("Clé Gemini invalide");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  console.log("[scan-meal] Gemini response:", JSON.stringify(json).slice(0, 400));
  return json;
}

async function callOpenAI(apiKey: string, b64: string, mt: string): Promise<unknown> {
  console.log("[scan-meal] → OpenAI GPT-4o, b64 length:", b64.length);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Identifie chaque aliment séparément et donne sa masse estimée (grammes) avec ses macros." },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}`, detail: "auto" } },
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
    console.error("[scan-meal] OpenAI error:", body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite OpenAI atteinte");
    if (res.status === 402) throw new Error("Crédits OpenAI épuisés");
    if (res.status === 401) throw new Error("Clé OpenAI invalide");
    if (res.status === 400) throw new Error(`OpenAI 400: ${body.slice(0, 200)}`);
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
    if (internalDetails !== undefined) console.error("[scan-meal] FAIL:", userMsg, internalDetails);
    else console.warn("[scan-meal] FAIL:", userMsg);
    return json200({ error: userMsg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    console.log("[scan-meal] START — keys:", { gemini: !!GEMINI_API_KEY, openai: !!OPENAI_API_KEY });

    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return fail("Service IA indisponible (aucune clé API configurée).", "both keys absent");
    }

    const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);
    console.log("[scan-meal] auth ok:", userData.user.id);

    const rl = await checkRateLimit(supa, userData.user.id, "scan_meal", 20);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/20 scans par heure). Réessaie plus tard.`);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch (e) { return fail("Corps invalide (JSON attendu).", e instanceof Error ? e.message : String(e)); }

    const { image_base64, mime_type } = body;
    if (!image_base64 || typeof image_base64 !== "string") return fail("Champ image_base64 manquant.");
    if (image_base64.length < 100) return fail("Image vide ou corrompue.");
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse (max ~9 Mo).");

    const mt = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";
    console.log("[scan-meal] mime:", mt, "b64 chars:", image_base64.length);

    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (GEMINI_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callGemini(GEMINI_API_KEY, image_base64, mt);
        console.log("[scan-meal] Gemini ok, ms:", Date.now() - t0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aiErrors.push(`Gemini: ${msg}`);
        console.error("[scan-meal] Gemini failed:", msg);
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
          : "Le service d'analyse IA est temporairement indisponible.",
        aiErrors,
      );
    }

    const parsed = extractFromAiResponse(aiJson);
    if (!parsed || !parsed.items || parsed.items.length === 0) {
      return fail("L'IA n'a pas pu analyser cette image. Essaie avec une photo plus nette et mieux éclairée.");
    }

    // Sanity check + nettoyage de chaque item (bornes/typage communs)
    const items = parsed.items.map(sanitizeMealItem);

    const result: MealAnalysisResult = {
      items,
      meal:       isMealSlug(parsed.meal) ? parsed.meal : "dejeuner",
      confidence: safeNum(parsed.confidence, 0.7),
    };

    const totalKcal = items.reduce((s, i) => s + i.calories, 0);
    console.log("[scan-meal] SUCCESS:", items.length, "items,", Math.round(totalKcal), "kcal total");

    await recordRateLimit(supa, userData.user.id, "scan_meal");

    return json200(result as unknown as Record<string, unknown>);

  } catch (e) {
    console.error("[scan-meal] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'analyse. Réessaie." });
  }
});
