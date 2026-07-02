// Analyse IA complète d'une séance terminée : bilan, muscles, perfs, récupération, conseils.
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

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[analyze-workout]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return fail("Service indisponible", 500, "GEMINI_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const rl = await checkRateLimit(supa, userData.user.id, "analyze_workout", 10);
    if (!rl.ok) return fail("Limite atteinte (10 analyses/h). Réessaie plus tard.", 429);

    const body = await req.json();

    // ── Validation du payload ──────────────────────────────────────────────────
    const workout = body.workout as {
      name: string;
      duration_minutes: number;
      exercises: Array<{
        name: string;
        muscles: string[];
        sets: Array<{ reps: number | null; weight: number | null; completed: boolean }>;
      }>;
    };

    if (!workout?.exercises?.length) return fail("Séance vide", 400);

    const history = (body.history ?? []) as Array<{
      date: string;
      name: string;
      exercises: Array<{ name: string; weight: number | null; reps: number | null }>;
    }>;

    const recoveryMap = (body.recovery_map ?? {}) as Record<string, {
      status: "fatigued" | "recovering" | "ready" | "unknown";
      hoursRemaining: number | null;
    }>;

    // ── Construction du prompt ─────────────────────────────────────────────────
    const tonnage = workout.exercises.reduce((sum, ex) => {
      return sum + ex.sets.reduce((s2, set) => s2 + (set.reps ?? 0) * (set.weight ?? 0), 0);
    }, 0);

    const completedSets = workout.exercises.reduce((sum, ex) => {
      return sum + ex.sets.filter((s) => s.completed).length;
    }, 0);

    const totalSets = workout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

    // Trouver la dernière séance avec exercices similaires
    const lastSimilar = history.slice(0, 10).find((h) =>
      h.exercises.some((ex) =>
        workout.exercises.some((wex) =>
          ex.name.toLowerCase().includes(wex.name.toLowerCase().slice(0, 6))
        )
      )
    );

    const exerciseSummary = workout.exercises
      .map((ex) => {
        const completedSetsForEx = ex.sets.filter((s) => s.completed);
        const topWeight = Math.max(0, ...ex.sets.map((s) => s.weight ?? 0));
        return `- ${ex.name} (${ex.muscles.join(", ")}): ${completedSetsForEx.length} séries validées, charge max ${topWeight} kg`;
      })
      .join("\n");

    const recoveryContext = Object.entries(recoveryMap)
      .filter(([, v]) => v.status !== "unknown")
      .map(([muscle, v]) => `  ${muscle}: ${v.status}${v.hoursRemaining != null ? ` (${Math.round(v.hoursRemaining)}h restantes)` : ""}`)
      .join("\n");

    const prompt = `Tu es un coach sportif expert. Analyse cette séance d'entraînement et génère un rapport complet en FRANÇAIS.

SÉANCE : "${workout.name}"
- Durée : ${workout.duration_minutes} min
- Tonnage total : ${Math.round(tonnage)} kg
- Séries : ${completedSets}/${totalSets} validées
- Exercices :
${exerciseSummary}
${lastSimilar ? `\nDERNIÈRE SÉANCE SIMILAIRE (${lastSimilar.date}) : "${lastSimilar.name}" avec ${lastSimilar.exercises.length} exercices.` : ""}
${recoveryContext ? `\nÉTAT DE RÉCUPÉRATION ACTUEL :\n${recoveryContext}` : ""}

Génère un rapport structuré via tool calling. Sois précis, encourageant mais honnête. Maximum 2-3 phrases par section.`;

    const tool = {
      type: "function",
      function: {
        name: "save_workout_analysis",
        description: "Enregistrer l'analyse complète de la séance",
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "object",
              description: "Bilan global de la séance",
              properties: {
                headline: { type: "string", description: "1 phrase accrocheuse résumant la séance (ex: 'Séance push solide — tonnage en hausse de 12%')" },
                tonnage_comment: { type: "string", description: "Commentaire sur le tonnage et les séries" },
                duration_comment: { type: "string", description: "Commentaire sur la durée (trop court/adapté/long ?)" },
              },
              required: ["headline", "tonnage_comment"],
              additionalProperties: false,
            },
            muscles: {
              type: "object",
              description: "Analyse des muscles travaillés",
              properties: {
                trained: { type: "array", items: { type: "string" }, description: "Muscles effectivement travaillés" },
                balance_comment: { type: "string", description: "Équilibre agoniste/antagoniste, point positif ou alerte" },
                overloaded: { type: "array", items: { type: "string" }, description: "Muscles potentiellement surstimulés" },
              },
              required: ["trained", "balance_comment"],
              additionalProperties: false,
            },
            performance: {
              type: "object",
              description: "Analyse des performances",
              properties: {
                prs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      exercise: { type: "string" },
                      detail: { type: "string", description: "ex: '80 kg × 8 reps — nouveau PR estimé'" },
                    },
                    required: ["exercise", "detail"],
                    additionalProperties: false,
                  },
                  description: "Records ou performances notables",
                },
                intensity_comment: { type: "string", description: "Évaluation de l'intensité globale de la séance (tonnage, densité, charges vs historique)" },
                progression_comment: { type: "string", description: "Tendance de progression vs séances précédentes" },
              },
              required: ["intensity_comment"],
              additionalProperties: false,
            },
            recovery: {
              type: "object",
              description: "Conseils de récupération post-séance",
              properties: {
                rest_hours: { type: "number", description: "Heures de repos minimum recommandées avant de retravailler ces muscles" },
                priority_muscles: {
                  type: "array",
                  items: { type: "string" },
                  description: "Muscles nécessitant la plus longue récupération",
                },
                recovery_tip: { type: "string", description: "1 conseil concret de récupération (sommeil, nutrition, étirements…)" },
                overtraining_risk: { type: "string", enum: ["low", "medium", "high"], description: "Risque de surentraînement" },
              },
              required: ["rest_hours", "priority_muscles", "recovery_tip", "overtraining_risk"],
              additionalProperties: false,
            },
            next_session: {
              type: "object",
              description: "Recommandation pour la prochaine séance",
              properties: {
                recommended_muscles: { type: "array", items: { type: "string" }, description: "Muscles à cibler en priorité (récupérés)" },
                session_type: { type: "string", description: "Type de séance conseillé (force, volume, récup active, full body…)" },
                load_adjustment: { type: "string", description: "Ajustement de charge suggéré (ex: '+2.5 kg sur développé couché')" },
                timing: { type: "string", description: "Dans combien de temps tu peux ré-entraîner ces muscles" },
              },
              required: ["recommended_muscles", "session_type", "timing"],
              additionalProperties: false,
            },
          },
          required: ["summary", "muscles", "performance", "recovery", "next_session"],
          additionalProperties: false,
        },
      },
    };

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
          tools: [tool],
          tool_choice: { type: "function", function: { name: "save_workout_analysis" } },
        }),
      },
    );

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("[analyze-workout] AI error:", aiRes.status, txt.slice(0, 300));
      return fail("Erreur IA. Réessaie dans un instant.", 502);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fail("Réponse IA invalide", 502);
    const analysis = JSON.parse(call.function.arguments);

    // Persister l'analyse en base
    const workoutId = typeof body.workout_id === "string" ? body.workout_id : null;
    if (workoutId) {
      await supa
        .from("workout_analyses")
        .upsert(
          { user_id: userData.user.id, workout_id: workoutId, summary: analysis },
          { onConflict: "workout_id" },
        );
    }

    await recordRateLimit(supa, userData.user.id, "analyze_workout");

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de l'analyse", 500, e);
  }
});
