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
          description:
            "Liste de CHAQUE ingrédient identifié séparément — jamais un plat ou une préparation composée " +
            "regroupés en une seule entrée. Un ingrédient = une entrée (ex. le poulet, la panure, la sauce " +
            "soja et le riz d'un poulet karaage sont 4 entrées distinctes, jamais une seule).",
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

RÈGLE PRINCIPALE — DÉCOMPOSITION MAXIMALE PAR INGRÉDIENT :
Il est INTERDIT de retourner un plat ou une préparation composée comme un seul élément. Chaque ingrédient
identifiable ou raisonnablement estimable doit être une entrée séparée, avec son propre nom, sa propre
masse estimée (grammes) et ses propres macros (kcal, protéines, glucides, lipides). Tu dois privilégier une
granularité PAR INGRÉDIENT, jamais par plat ni par préparation.

Interdit (élément unique représentant tout un plat) :
- "Poulet karaage avec sauce soja"
- "Curry vert au cabillaud"
- "Burger avec frites"

Attendu (décomposition en ingrédients) :
- Poulet karaage → ["Poulet", "Panure / farine / fécule", "Huile de cuisson absorbée", "Sauce soja",
  "Sauce sucrée", "Riz", "Chou", "Carotte", "Mayonnaise / sauce de salade"] selon ce qui est réellement
  visible, indiqué par l'utilisateur ou raisonnablement déductible de la préparation.
- Curry vert → ["Cabillaud", "Lait de coco", "Pâte / sauce curry vert", "Pousses de bambou", "Poivron",
  "Courgette", "Basilic / herbes", "Riz"] selon ce qui est présent.
- Assiette de sushis → ["5 sushis saumon", "3 maki concombre", "wasabi"]
- Repas équilibré → ["Poulet grillé 150 g", "Riz blanc cuit 180 g", "Haricots verts 80 g"]
- Petit-déjeuner → ["Flocons d'avoine 60 g", "Lait demi-écrémé 150 ml", "Banane 120 g"]

Sauces : sépare TOUJOURS les sauces identifiables (ex. "Sauce soja", "Mayonnaise", "Sauce teriyaki") en
entrées propres, avec leur propre masse et macros estimées séparément — ne les fusionne jamais dans
l'aliment principal.

Ingrédients non visibles directement (huile de cuisson, panure, fécule, etc.) : ajoute-les comme entrées
séparées lorsqu'ils sont raisonnablement nécessaires à la préparation et nutritionnellement significatifs
(ex. friture, panure). Reste conservateur sur leur quantité et n'invente pas d'ingrédient précis sans indice
suffisant (visuel ou textuel).

Cohérence globale : la somme des masses/macros de tous les ingrédients doit rester cohérente avec la
portion globale observée sur la photo (ne double pas la taille du plat en multipliant les entrées).

Méthode par ingrédient :
1. Estime la masse en grammes (repères : assiette ~25 cm, fourchette ~20 cm).
2. Applique les valeurs /100 g de la table CIQUAL.
3. Calcule kcal + protéines + glucides + lipides pour cette masse estimée.
4. Renvoie aussi cette masse (grams) : c'est elle qui sera enregistrée comme poids de référence.

Si un ingrédient est ambigu, prends la valeur moyenne et baisse confidence.
Retourne STRICTEMENT du JSON via tool calling. Tout le texte en FRANÇAIS.`;

const CONTEXT_INSTRUCTIONS = `L'utilisateur a décrit son plat avant l'analyse. Ce texte sert à t'aider à comprendre le plat et à
identifier CORRECTEMENT ses ingrédients — il est PRIORITAIRE sur ce que tu crois voir sur la photo : si
l'utilisateur nomme explicitement un aliment ou un ingrédient (ex. « curry vert au cabillaud »), utilise CET
ingrédient (le cabillaud) même s'il ressemble visuellement à autre chose (ex. ne jamais l'identifier comme
du poulet).

Le contexte utilisateur ne doit JAMAIS devenir le nom d'un élément unique représentant tout le repas
(ex. ne retourne jamais "Curry vert au cabillaud" comme une seule entrée) : utilise-le pour nommer/corriger
les ingrédients individuels (le poisson, la sauce curry, le lait de coco, etc.), puis décompose le reste du
plat normalement en ingrédients séparés à partir de la photo.
Utilise la photo pour repérer les AUTRES ingrédients non mentionnés et pour estimer les portions/macros.
N'invente pas d'ingrédient qui n'est ni visible sur la photo ni mentionné dans la description, ni
raisonnablement déductible de la préparation décrite.`;

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

async function callGemini(apiKey: string, b64: string, mt: string, userContext?: string): Promise<unknown> {
  console.log("[scan-meal] → Gemini 2.5 Flash, b64 length:", b64.length, "context:", !!userContext);
  const systemPrompt = userContext ? `${SYSTEM_PROMPT}\n\n${CONTEXT_INSTRUCTIONS}` : SYSTEM_PROMPT;
  const userText = userContext
    ? `Description du plat par l'utilisateur : « ${userContext} »\nDécompose ce plat en CHAQUE ingrédient distinct (en priorisant cette description pour les identifier correctement, sans jamais nommer un seul élément pour tout le plat) et donne pour chacun sa masse estimée (grammes) avec ses macros.`
    : "Décompose ce plat en CHAQUE ingrédient distinct (jamais un seul élément par plat) et donne pour chacun sa masse estimée (grammes) avec ses macros.";
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
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

async function callOpenAI(apiKey: string, b64: string, mt: string, userContext?: string): Promise<unknown> {
  console.log("[scan-meal] → OpenAI GPT-4o, b64 length:", b64.length, "context:", !!userContext);
  const systemPrompt = userContext ? `${SYSTEM_PROMPT}\n\n${CONTEXT_INSTRUCTIONS}` : SYSTEM_PROMPT;
  const userText = userContext
    ? `Description du plat par l'utilisateur : « ${userContext} »\nDécompose ce plat en CHAQUE ingrédient distinct (en priorisant cette description pour les identifier correctement, sans jamais nommer un seul élément pour tout le plat) et donne pour chacun sa masse estimée (grammes) avec ses macros.`
    : "Décompose ce plat en CHAQUE ingrédient distinct (jamais un seul élément par plat) et donne pour chacun sa masse estimée (grammes) avec ses macros.";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
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

    const { image_base64, mime_type, user_context } = body;
    if (!image_base64 || typeof image_base64 !== "string") return fail("Champ image_base64 manquant.");
    if (image_base64.length < 100) return fail("Image vide ou corrompue.");
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse (max ~9 Mo).");

    const mt = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";
    const userContext =
      typeof user_context === "string" && user_context.trim().length > 0
        ? user_context.trim().slice(0, 300)
        : undefined;
    console.log("[scan-meal] mime:", mt, "b64 chars:", image_base64.length, "context:", !!userContext);

    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (GEMINI_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callGemini(GEMINI_API_KEY, image_base64, mt, userContext);
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
        aiJson = await callOpenAI(OPENAI_API_KEY, image_base64, mt, userContext);
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
