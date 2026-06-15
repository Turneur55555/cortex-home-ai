// Analyse une photo de machine/exercice → propose top 3 exercices du catalogue.
// Retourne TOUJOURS HTTP 200 — erreurs dans { error: "..." }.
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

interface Suggestion {
  name: string;
  group: string;
  confidence: number;
  reason?: string;
}

interface ScanExerciseResult {
  suggestions: Suggestion[];
  detected_machine?: string;
}

const TOOL = {
  type: "function",
  function: {
    name: "suggest_exercises",
    description: "Propose les 3 exercices les plus probables vus sur la photo (machine de salle, équipement libre, ou mouvement).",
    parameters: {
      type: "object",
      properties: {
        detected_machine: {
          type: "string",
          description: "Nom court de la machine / équipement identifié (ex: 'Leg press 45°', 'Câble basse poulie'). Vide si flou.",
        },
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom EXACT depuis le catalogue fourni." },
              group: { type: "string", description: "Groupe musculaire EXACT depuis le catalogue." },
              confidence: { type: "number", description: "0..1" },
              reason: { type: "string", description: "1 phrase justificative." },
            },
            required: ["name", "group", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(catalog: { name: string; group: string }[]): string {
  const list = catalog.map((e) => `- ${e.name} [${e.group}]`).join("\n");
  return `Tu es un coach sportif expert capable de reconnaître machines et exercices de musculation.

Analyse la photo (machine de salle, banc, câble, mouvement, etc.) et propose les 3 exercices les PLUS PROBABLES réalisables avec cet équipement.

RÈGLE ABSOLUE : tu DOIS choisir parmi la liste suivante UNIQUEMENT, en reprenant le name et group EXACTS (caractères, accents, casse) :

${list}

Si plusieurs exercices sont plausibles sur la même machine (ex: poulie haute → tirage vertical large / serrée / neutre), propose-les classés par probabilité décroissante. Si rien ne correspond, renvoie quand même les 3 plus proches avec confidence faible.`;
}

async function callGemini(apiKey: string, b64: string, mt: string, systemPrompt: string): Promise<unknown> {
  console.log("[scan-exercise] → Lovable Gemini, b64 length:", b64.length);
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Quels exercices peut-on faire sur cet équipement ? Propose le top 3 du catalogue." },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}` } },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "suggest_exercises" } },
    }),
  });

  console.log("[scan-exercise] Lovable status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-exercise] Lovable error body:", body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite IA atteinte — réessaie dans un instant.");
    if (res.status === 402) throw new Error("Crédits IA épuisés.");
    if (res.status === 401) throw new Error("Clé IA invalide.");
    throw new Error(`Lovable ${res.status}`);
  }
  return await res.json();
}

function extractFromAi(aiJson: unknown): ScanExerciseResult | null {
  const calls = (aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> })
    ?.choices?.[0]?.message?.tool_calls;
  if (calls && calls.length > 0) {
    try {
      const p = JSON.parse(calls[0].function.arguments);
      if (Array.isArray(p?.suggestions)) return p as ScanExerciseResult;
    } catch (e) {
      console.warn("[scan-exercise] tool_call JSON parse failed:", e);
    }
  }
  console.error("[scan-exercise] no parseable result, raw:", JSON.stringify(aiJson).slice(0, 600));
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
  const fail = (msg: string, details?: unknown) => {
    console.warn("[scan-exercise] FAIL:", msg, details ?? "");
    return json200({ error: msg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return fail("Service IA indisponible.");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);

    const rl = await checkRateLimit(supa, userData.user.id, "scan_exercise", 30);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/30 scans par heure).`);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps de requête invalide.", e instanceof Error ? e.message : String(e));
    }

    const { image_base64, mime_type, catalog } = body;

    if (!image_base64 || typeof image_base64 !== "string" || image_base64.length < 100) {
      return fail("Image manquante ou invalide.");
    }
    if (image_base64.length > 12_000_000) {
      return fail("Image trop volumineuse (max ~9 Mo). Réduis la qualité.");
    }
    if (!Array.isArray(catalog) || catalog.length === 0) {
      return fail("Catalogue manquant.");
    }
    // Filtre safe
    const safeCatalog = (catalog as Array<{ name?: unknown; group?: unknown }>)
      .filter((e) => typeof e?.name === "string" && typeof e?.group === "string")
      .slice(0, 300)
      .map((e) => ({ name: e.name as string, group: e.group as string }));

    if (safeCatalog.length === 0) return fail("Catalogue invalide.");

    const mt = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

    const aiJson = await callGemini(GEMINI_API_KEY, image_base64, mt, buildSystemPrompt(safeCatalog));
    const parsed = extractFromAi(aiJson);

    if (!parsed || !parsed.suggestions?.length) {
      return fail("L'IA n'a pas identifié l'équipement. Essaie une photo plus nette et bien cadrée.");
    }

    // Valide chaque suggestion contre le catalogue (anti-hallucination)
    const catalogNames = new Set(safeCatalog.map((e) => e.name));
    const cleaned: Suggestion[] = parsed.suggestions
      .filter((s) => s && typeof s.name === "string" && catalogNames.has(s.name))
      .slice(0, 3)
      .map((s) => ({
        name: s.name,
        group: s.group,
        confidence: typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0.5,
        reason: typeof s.reason === "string" ? s.reason.slice(0, 200) : undefined,
      }));

    if (cleaned.length === 0) {
      return fail("Aucune correspondance fiable dans le catalogue. Recherche manuellement.");
    }

    await recordRateLimit(supa, userData.user.id, "scan_exercise");

    return json200({
      suggestions: cleaned,
      detected_machine: typeof parsed.detected_machine === "string" ? parsed.detected_machine.slice(0, 100) : undefined,
    });
  } catch (e) {
    console.error("[scan-exercise] unhandled:", e);
    return json200({ error: e instanceof Error ? e.message : "Erreur inattendue." });
  }
});
