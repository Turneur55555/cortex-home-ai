// Analyse un texte décrivant un repas → retourne la liste de chaque aliment identifié avec ses macros.
// Utilise GEMINI_API_KEY (Gemini 2.5 Flash). Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." }.
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

interface ParsedItem {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  grams?: number;
}

interface ParseResult {
  items: ParsedItem[];
  meal?: string;
  confidence?: number;
  details?: string;
}

const MEAL_TOOL = {
  type: "function",
  function: {
    name: "save_meal",
    description: "Enregistrer la liste détaillée de chaque aliment mentionné dans le texte avec ses macros",
    parameters: {
      type: "object",
      properties: {
        meal: {
          type: "string",
          enum: ["petit-dej", "dejeuner", "diner", "collation"],
          description: "Type de repas le plus probable selon le contenu ou l'heure mentionnée",
        },
        confidence: {
          type: "number",
          description: "Niveau de confiance global 0..1",
        },
        details: {
          type: "string",
          description: "1-2 phrases résumant les aliments et portions identifiés",
        },
        items: {
          type: "array",
          description: "Liste de chaque aliment mentionné séparément. Un aliment = une entrée.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Nom de l'aliment avec quantité (ex: 'Saumon 100 g', 'Noix de cajou 100 g')",
              },
              calories: { type: "number", description: "kcal pour la portion donnée" },
              proteins: { type: "number", description: "Protéines en g" },
              carbs:    { type: "number", description: "Glucides en g" },
              fats:     { type: "number", description: "Lipides en g" },
              grams: {
                type: "number",
                description:
                  "Masse en grammes de la portion : la quantité exacte mentionnée si précisée (ex: '100 g de saumon' → 100), " +
                  "sinon l'estimation de la portion standard utilisée pour calculer les macros ci-dessus. " +
                  "Toujours la fournir quand une estimation réaliste est possible ; ne l'omettre que si aucune n'est possible.",
              },
            },
            required: ["name", "calories", "proteins", "carbs", "fats"],
            additionalProperties: false,
          },
          minItems: 1,
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Tu es un nutritionniste expert. L'utilisateur décrit oralement ce qu'il a mangé.
Identifie CHAQUE aliment séparément avec ses macros pour la portion mentionnée.

Règles :
- Si une quantité est précisée (ex: "100 g de saumon"), utilise-la exactement.
- Si aucune quantité n'est précisée, utilise une portion standard raisonnable.
- Applique les valeurs nutritionnelles /100 g de la table CIQUAL.
- Calcule kcal + protéines + glucides + lipides pour chaque portion.
- Renseigne toujours le champ grams avec la masse (précisée ou estimée) utilisée pour ce calcul — c'est la valeur par défaut utilisée par l'app, ne l'omets que si aucune estimation réaliste n'est possible.
- Tout le texte en FRANÇAIS.
- Retourne STRICTEMENT via tool calling, jamais de texte libre.`;

function extractFromAiResponse(aiJson: unknown): ParseResult | null {
  const calls = (aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { arguments: string } }> } }> })
    ?.choices?.[0]?.message?.tool_calls;

  if (calls && calls.length > 0) {
    try {
      const p = JSON.parse(calls[0].function.arguments);
      if (Array.isArray(p?.items) && p.items.length > 0) {
        return p as ParseResult;
      }
    } catch (e) {
      console.warn("[parse-meal-text] tool_call JSON parse failed:", e);
    }
  }

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
        if (Array.isArray(p?.items)) return p as ParseResult;
      } catch {/* ignore */}
    }
  }

  console.error("[parse-meal-text] aucun résultat parseable, raw:", JSON.stringify(aiJson).slice(0, 600));
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) console.error("[parse-meal-text] FAIL:", userMsg, internalDetails);
    else console.warn("[parse-meal-text] FAIL:", userMsg);
    return json200({ error: userMsg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return fail("Service IA indisponible (clé API manquante).", "key absent");

    const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);

    const rl = await checkRateLimit(supa, userData.user.id, "parse_meal_text", 30);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/30 analyses par heure). Réessaie plus tard.`);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch (e) { return fail("Corps invalide (JSON attendu).", e instanceof Error ? e.message : String(e)); }

    const { text } = body;
    if (!text || typeof text !== "string") return fail("Champ text manquant.");
    if (text.trim().length < 3) return fail("Texte trop court pour être analysé.");
    if (text.length > 2000) return fail("Texte trop long (max 2000 caractères).");

    console.log("[parse-meal-text] text:", text.slice(0, 200));

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        tools: [MEAL_TOOL],
        tool_choice: { type: "function", function: { name: "save_meal" } },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[parse-meal-text] Gemini error:", res.status, errBody.slice(0, 300));
      return fail("Le service d'analyse IA est temporairement indisponible. Réessaie.");
    }

    const aiJson = await res.json();
    const parsed = extractFromAiResponse(aiJson);

    if (!parsed || !parsed.items || parsed.items.length === 0) {
      return fail("Je n'ai pas pu identifier d'aliments dans ce texte. Précise par exemple : '100 g de poulet, 80 g de riz'.");
    }

    const safeNum = (v: unknown, fallback = 0) =>
      typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : fallback;

    // Masse en grammes : bornée [1, 5000] g, absente si non fournie ou non plausible
    // (l'app retombe alors sur une unité générique plutôt que d'inventer un poids).
    const safeGrams = (v: unknown): number | undefined =>
      typeof v === "number" && isFinite(v) && v >= 1 && v <= 5000 ? Math.round(v) : undefined;

    const items: ParsedItem[] = parsed.items.map((item) => ({
      name:     typeof item.name === "string" ? item.name.slice(0, 200) : "Aliment",
      calories: safeNum(item.calories),
      proteins: safeNum(item.proteins),
      carbs:    safeNum(item.carbs),
      fats:     safeNum(item.fats),
      grams: safeGrams(item.grams),
    }));

    const result: ParseResult = {
      items,
      meal:       ["petit-dej","dejeuner","diner","collation"].includes(parsed.meal ?? "") ? parsed.meal : undefined,
      confidence: safeNum(parsed.confidence, 0.8),
      details:    typeof parsed.details === "string" ? parsed.details.slice(0, 500) : undefined,
    };

    console.log("[parse-meal-text] SUCCESS:", items.length, "items");
    await recordRateLimit(supa, userData.user.id, "parse_meal_text");

    return json200(result as unknown as Record<string, unknown>);

  } catch (e) {
    console.error("[parse-meal-text] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'analyse. Réessaie." });
  }
});
