// Analyse IA approfondie « à la demande » d'un exercice.
// Reçoit la fiche déjà calculée côté client (moteur déterministe) et renvoie
// une analyse rédigée, personnalisée et enrichie en langage naturel.
// Le client garde toujours son texte déterministe en repli : cette fonction
// n'est appelée que lorsque l'utilisateur demande l'analyse approfondie.
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

interface MuscleLine {
  name: string;
  role: string;
  solicitation: number;
  recovery: string;
}
interface Payload {
  exercise?: string;
  objective?: string;
  generic_model?: boolean;
  muscles?: MuscleLine[];
  physical_impact?: Array<{ trait: string; score: number }>;
  comparison?: {
    state?: string;
    prs?: string[];
    metrics?: Array<{ key: string; current: number | null; previous: number | null; delta_pct: number | null }>;
  };
  recommendations?: string[];
  imbalances?: string[];
  relevance?: { stars?: number; label?: string };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[analyze-exercise]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return fail("Service indisponible", 500, "GEMINI_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const rl = await checkRateLimit(supa, userData.user.id, "analyze_exercise", 20);
    if (!rl.ok) return fail("Limite atteinte (20 analyses/h). Réessaie plus tard.", 429);

    const body = (await req.json()) as Payload;
    if (!body?.exercise) return fail("Exercice manquant", 400);

    const muscles = (body.muscles ?? [])
      .map((m) => `  - ${m.name} (${m.role}, sollicitation ${m.solicitation}/100, récupération : ${m.recovery})`)
      .join("\n");
    const impact = (body.physical_impact ?? [])
      .map((t) => `${t.trait} ${t.score}/100`)
      .join(", ");
    const metrics = (body.comparison?.metrics ?? [])
      .map((mt) => `${mt.key} : ${mt.previous ?? "—"} → ${mt.current ?? "—"}${mt.delta_pct != null ? ` (${mt.delta_pct >= 0 ? "+" : ""}${mt.delta_pct}%)` : ""}`)
      .join(" | ");
    const prs = (body.comparison?.prs ?? []).join(", ");
    const recos = (body.recommendations ?? []).map((r) => `  - ${r}`).join("\n");
    const imbalances = (body.imbalances ?? []).map((i) => `  - ${i}`).join("\n");

    const prompt = `Tu es un coach de musculation expert, précis et bienveillant. À partir des données pré-calculées ci-dessous, rédige en FRANÇAIS une analyse personnalisée de cet exercice pour l'utilisateur.

Consignes de style :
- 4 à 6 phrases, ton direct et motivant, à la deuxième personne ("tu").
- Prose fluide, AUCUN titre, AUCUNE puce, AUCun markdown.
- Ne réinvente pas de chiffres : appuie-toi uniquement sur les données fournies.
- Explique le "pourquoi" (progression/stagnation/régression) et termine par la priorité concrète la plus utile.

EXERCICE : ${body.exercise}
Objectif de l'utilisateur : ${body.objective ?? "non précisé"}
${body.generic_model ? "(Exercice non reconnu : modèle biomécanique générique.)" : ""}
Pertinence : ${body.relevance?.stars ?? "?"}/5 (${body.relevance?.label ?? ""})
Muscles :
${muscles || "  - (non déterminés)"}
Aspects physiques développés : ${impact || "non déterminés"}
État de progression : ${body.comparison?.state ?? "inconnu"}
Évolution des métriques : ${metrics || "pas d'historique"}
Records battus : ${prs || "aucun"}
Recommandations calculées :
${recos || "  - aucune"}
Déséquilibres détectés :
${imbalances || "  - aucun"}`;

    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      },
    );

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("[analyze-exercise] AI error:", aiRes.status, txt.slice(0, 300));
      return fail("Erreur IA. Réessaie dans un instant.", 502);
    }

    const aiJson = await aiRes.json();
    const text = aiJson.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") return fail("Réponse IA invalide", 502);

    await recordRateLimit(supa, userData.user.id, "analyze_exercise");

    return new Response(JSON.stringify({ text: text.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de l'analyse", 500, e);
  }
});
