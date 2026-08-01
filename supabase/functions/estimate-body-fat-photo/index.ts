// Estime une FOURCHETTE de Body Fat à partir de 2-3 photos corporelles
// standardisées (face + profil, dos optionnel). Réutilise EXACTEMENT le
// pattern IA déjà en production (scan-meal/analyze-pdf) : Gemini 2.5 Flash
// (GEMINI_API_KEY) en priorité, GPT-4o (OPENAI_API_KEY) en fallback —
// aucun nouveau fournisseur externe.
//
// Contrat de sortie STRICT : jamais un nombre unique. Le modèle DOIT
// renvoyer une fourchette (minPercent/maxPercent) — voir TOOL ci-dessous,
// `additionalProperties: false` + `required` interdisent toute réponse
// hors-schéma. Aucun diagnostic médical, aucune identification de la
// personne — instructions explicites dans SYSTEM_PROMPT.
//
// Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." } ou
// { status: "failed"/"insufficient_quality" } (jamais un Body Fat inventé
// dans ces cas, voir lib/fitness/bodyFatPhotoEstimate.ts côté client qui
// normalise cette réponse).
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";

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

// ─── Tool definition — fourchette obligatoire, jamais un point unique ────────

const ESTIMATE_TOOL = {
  type: "function",
  function: {
    name: "save_estimate",
    description:
      "Enregistrer une estimation de Body Fat en FOURCHETTE à partir de photos corporelles. Ne jamais renvoyer un pourcentage unique — toujours une fourchette réaliste reflétant l'incertitude d'une analyse visuelle.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["success", "insufficient_quality"],
          description:
            "'insufficient_quality' si le corps n'est pas suffisamment visible, l'éclairage/cadrage rendent l'estimation non fiable, ou une vue essentielle manque.",
        },
        minPercent: {
          type: "number",
          description: "Borne basse de la fourchette de Body Fat estimée (%). Null si status = insufficient_quality.",
        },
        maxPercent: {
          type: "number",
          description: "Borne haute de la fourchette de Body Fat estimée (%). Null si status = insufficient_quality.",
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Limites de l'estimation ou raisons de qualité insuffisante, en français, sans jargon médical.",
        },
      },
      required: ["status", "warnings"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Tu es un assistant d'estimation VISUELLE et INDICATIVE de la composition corporelle à partir de photos.

RÈGLES ABSOLUES :
1. Tu ne fournis JAMAIS un pourcentage unique — TOUJOURS une fourchette (minPercent/maxPercent) reflétant l'incertitude réelle d'une simple analyse visuelle. Une fourchette de moins de 3 points de pourcentage n'est pas crédible pour ce type d'analyse.
2. Tu ne poses AUCUN diagnostic médical, ne mentionnes jamais : obésité pathologique, troubles alimentaires, hormones, maladies, rétention d'eau, santé mentale, dysmorphie. Tu estimes uniquement une composition corporelle visuelle avec incertitude.
3. Tu n'identifies JAMAIS la personne — ignore le visage, ne décris aucun trait identifiant, ne commente jamais l'apparence hors composition corporelle.
4. Si le corps n'est pas suffisamment visible (cadrage, vêtements, luminosité, angle), retourne status="insufficient_quality" avec minPercent/maxPercent null et une explication courte dans warnings — n'invente JAMAIS une fourchette dans ce cas.
5. Réponds STRICTEMENT via l'outil fourni. Tout le texte en FRANÇAIS.`;

// ─── Appels IA (pattern identique à scan-meal, image_url en data-URI) ────────

interface PhotoInput {
  b64: string;
  mime: string;
  label: string;
}

function buildUserContent(photos: PhotoInput[]) {
  return [
    {
      type: "text",
      text: `Estime une fourchette de Body Fat (%) à partir de ces ${photos.length} photo(s) corporelle(s) (${photos
        .map((p) => p.label)
        .join(", ")}).`,
    },
    ...photos.map((p) => ({
      type: "image_url",
      image_url: { url: `data:${p.mime};base64,${p.b64}` },
    })),
  ];
}

async function callGemini(apiKey: string, photos: PhotoInput[]): Promise<unknown> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(photos) },
      ],
      tools: [ESTIMATE_TOOL],
      tool_choice: { type: "function", function: { name: "save_estimate" } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite Gemini atteinte");
    if (res.status === 402) throw new Error("Crédits Gemini épuisés");
    if (res.status === 401) throw new Error("Clé Gemini invalide");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function callOpenAI(apiKey: string, photos: PhotoInput[]): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(photos) },
      ],
      tools: [ESTIMATE_TOOL],
      tool_choice: { type: "function", function: { name: "save_estimate" } },
      max_tokens: 512,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite OpenAI atteinte");
    if (res.status === 402) throw new Error("Crédits OpenAI épuisés");
    if (res.status === 401) throw new Error("Clé OpenAI invalide");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Parser ────────────────────────────────────────────────────────────────

interface ParsedEstimate {
  status: "success" | "insufficient_quality";
  minPercent: number | null;
  maxPercent: number | null;
  warnings: string[];
}

function extractFromAiResponse(aiJson: unknown): ParsedEstimate | null {
  const calls = (
    aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { arguments: string } }> } }> }
  )?.choices?.[0]?.message?.tool_calls;
  if (!calls || calls.length === 0) return null;
  try {
    const p = JSON.parse(calls[0].function.arguments);
    if (p?.status !== "success" && p?.status !== "insufficient_quality") return null;
    return {
      status: p.status,
      minPercent: typeof p.minPercent === "number" ? p.minPercent : null,
      maxPercent: typeof p.maxPercent === "number" ? p.maxPercent : null,
      warnings: Array.isArray(p.warnings) ? p.warnings.filter((w: unknown) => typeof w === "string") : [],
    };
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) console.error("[estimate-body-fat-photo] FAIL:", userMsg, internalDetails);
    return json200({ error: userMsg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return fail("Service IA indisponible (aucune clé API configurée).", "both keys absent");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);

    // Limite volontairement basse — analyse plus coûteuse (2-3 images) et
    // sensible qu'un scan de repas.
    const rl = await checkRateLimit(supa, userData.user.id, "estimate_body_fat_photo", 6);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/6 analyses par heure). Réessaie plus tard.`);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps invalide (JSON attendu).", e instanceof Error ? e.message : String(e));
    }

    const front = body.front as { b64?: string; mime?: string } | undefined;
    const side = body.side as { b64?: string; mime?: string } | undefined;
    const back = body.back as { b64?: string; mime?: string } | undefined;

    if (!front?.b64 || typeof front.b64 !== "string" || front.b64.length < 100) {
      return fail("Photo de face manquante ou invalide.");
    }
    if (!side?.b64 || typeof side.b64 !== "string" || side.b64.length < 100) {
      return fail("Photo de profil manquante ou invalide.");
    }
    for (const [label, img] of [["front", front], ["side", side], ["back", back]] as const) {
      if (img?.b64 && img.b64.length > 12_000_000) {
        return fail(`Photo ${label} trop volumineuse (max ~9 Mo).`);
      }
    }

    const photos: PhotoInput[] = [
      { b64: front.b64, mime: front.mime && front.mime.startsWith("image/") ? front.mime : "image/jpeg", label: "face" },
      { b64: side.b64, mime: side.mime && side.mime.startsWith("image/") ? side.mime : "image/jpeg", label: "profil" },
    ];
    if (back?.b64 && typeof back.b64 === "string" && back.b64.length >= 100) {
      photos.push({ b64: back.b64, mime: back.mime && back.mime.startsWith("image/") ? back.mime : "image/jpeg", label: "dos" });
    }

    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (GEMINI_API_KEY) {
      try {
        aiJson = await callGemini(GEMINI_API_KEY, photos);
      } catch (e) {
        aiErrors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
        aiJson = null;
      }
    }
    if (!aiJson && OPENAI_API_KEY) {
      try {
        aiJson = await callOpenAI(OPENAI_API_KEY, photos);
      } catch (e) {
        aiErrors.push(`OpenAI: ${e instanceof Error ? e.message : String(e)}`);
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
    if (!parsed) {
      return fail("L'IA n'a pas pu analyser ces photos. Réessaie avec des photos plus nettes.");
    }

    await recordRateLimit(supa, userData.user.id, "estimate_body_fat_photo");

    return json200({
      status: parsed.status,
      minPercent: parsed.minPercent,
      maxPercent: parsed.maxPercent,
      warnings: parsed.warnings,
    });
  } catch (e) {
    console.error("[estimate-body-fat-photo] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'analyse. Réessaie." });
  }
});
