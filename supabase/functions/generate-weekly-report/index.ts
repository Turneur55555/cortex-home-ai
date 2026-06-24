import { createClient } from "@supabase/supabase-js";

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

function getWeekBounds(weekStartStr?: string): { weekStart: string; weekEnd: string } {
  let monday: Date;
  if (weekStartStr) {
    monday = new Date(weekStartStr + "T00:00:00Z");
  } else {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
  }
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[generate-weekly-report]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { weekStart, weekEnd } = getWeekBounds(body?.week_start);

    // ── Workouts ─────────────────────────────────────────────────────────────
    const workoutsResult = await supa
      .from("workouts")
      .select("id, name, date, duration_minutes, exercises(name, sets, reps, weight, exercise_sets(reps, weight))")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd);
    // deno-lint-ignore no-explicit-any
    const workouts: any[] = workoutsResult.error ? [] : (workoutsResult.data ?? []);

    // ── Nutrition ─────────────────────────────────────────────────────────────
    const nutritionResult = await supa
      .from("nutrition")
      .select("date, calories, proteins, carbs, fats")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd);
    // deno-lint-ignore no-explicit-any
    const nutritionLogs: any[] = nutritionResult.error ? [] : (nutritionResult.data ?? []);

    // ── Body tracking ─────────────────────────────────────────────────────────
    const bodyResult = await supa
      .from("body_tracking")
      .select("date, weight, body_fat, muscle_mass, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date", { ascending: true });
    // deno-lint-ignore no-explicit-any
    const bodyEntries: any[] = bodyResult.error ? [] : (bodyResult.data ?? []);

    // ── Nutrition goals ───────────────────────────────────────────────────────
    const goalsResult = await supa
      .from("nutrition_goals")
      .select("calories, proteins, carbs, fats")
      .eq("user_id", userId)
      .maybeSingle();
    const goals = goalsResult.data ?? { calories: 2000, proteins: 150, carbs: 200, fats: 70 };

    // ── Fitness metrics ───────────────────────────────────────────────────────
    const sessionsCount = workouts.length;
    const totalTrainingTime = workouts.reduce((s, w) => s + (w.duration_minutes ?? 0), 0);

    // Volume réel via exercise_sets (somme reps*weight par série) ;
    // fallback sur les colonnes agrégées legacy si aucune série détaillée.
    // deno-lint-ignore no-explicit-any
    const exerciseVolume = (ex: any): number => {
      const detailed = (ex.exercise_sets ?? []) as any[];
      if (detailed.length > 0) {
        return detailed.reduce((acc, set) => {
          const reps = Number(set.reps);
          const weight = Number(set.weight);
          if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps <= 0 || weight <= 0) return acc;
          return acc + reps * weight;
        }, 0);
      }
      const sets = ex.sets ?? 0;
      const reps = ex.reps ?? 0;
      const weight = ex.weight ?? 0;
      if (sets <= 0 || reps <= 0 || weight <= 0) return 0;
      return sets * reps * weight;
    };

    // deno-lint-ignore no-explicit-any
    const exerciseMap: Record<string, { sets: number; reps: number; totalWeight: number; count: number }> = {};
    for (const w of workouts) {
      for (const ex of (w.exercises ?? []) as any[]) {
        const name: string = ex.name ?? "Inconnu";
        if (!exerciseMap[name]) exerciseMap[name] = { sets: 0, reps: 0, totalWeight: 0, count: 0 };
        const detailed = (ex.exercise_sets ?? []) as any[];
        if (detailed.length > 0) {
          const repsSum = detailed.reduce((a, set) => a + (Number(set.reps) || 0), 0);
          exerciseMap[name].sets += detailed.length;
          exerciseMap[name].reps += Math.round(repsSum / detailed.length);
        } else {
          exerciseMap[name].sets += ex.sets ?? 0;
          exerciseMap[name].reps += ex.reps ?? 0;
        }
        exerciseMap[name].totalWeight += exerciseVolume(ex);
        exerciseMap[name].count += 1;
      }
    }

    const topExercises = Object.entries(exerciseMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, d]) => ({ name, sets: d.sets, reps: Math.round(d.reps / (d.count || 1)) }));

    const totalVolume = Object.values(exerciseMap).reduce((s, d) => s + d.totalWeight, 0);

    // ── Nutrition metrics ─────────────────────────────────────────────────────
    const dailyNutrition: Record<string, { calories: number; proteins: number; carbs: number; fats: number }> = {};
    for (const log of nutritionLogs) {
      const date: string = log.date ?? "";
      if (!dailyNutrition[date]) dailyNutrition[date] = { calories: 0, proteins: 0, carbs: 0, fats: 0 };
      dailyNutrition[date].calories += log.calories ?? 0;
      dailyNutrition[date].proteins += log.proteins ?? 0;
      dailyNutrition[date].carbs += log.carbs ?? 0;
      dailyNutrition[date].fats += log.fats ?? 0;
    }

    const days = Object.values(dailyNutrition);
    const avgCalories = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length) : 0;
    const avgProteins = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.proteins, 0) / days.length) : 0;
    const avgCarbs = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.carbs, 0) / days.length) : 0;
    const avgFats = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.fats, 0) / days.length) : 0;

    const goalsCalories = goals.calories ?? 2000;
    const goalsProtein = goals.proteins ?? 150;
    const caloriesPct = goalsCalories > 0 ? Math.round((avgCalories / goalsCalories) * 100) : 0;
    const proteinsPct = goalsProtein > 0 ? Math.round((avgProteins / goalsProtein) * 100) : 0;
    const goalsRespectPct = Math.round((caloriesPct + proteinsPct) / 2);

    const sortedByCalories = Object.entries(dailyNutrition).sort((a, b) => b[1].calories - a[1].calories);
    const bestDays = sortedByCalories.slice(0, 2).map(([d]) => d);
    const worstDays = sortedByCalories.slice(-2).map(([d]) => d);

    // ── Body metrics ──────────────────────────────────────────────────────────
    const firstBody = bodyEntries[0] ?? null;
    const lastBody = bodyEntries[bodyEntries.length - 1] ?? null;
    const weightStart: number | null = firstBody?.weight ?? null;
    const weightEnd: number | null = lastBody?.weight ?? null;
    const weightDelta =
      weightStart != null && weightEnd != null
        ? Math.round((weightEnd - weightStart) * 100) / 100
        : null;

    const measurementFields = ["chest", "waist", "hips", "left_arm", "right_arm", "left_thigh", "right_thigh"];
    const measurementsEvolution: Record<string, number> = {};
    if (firstBody && lastBody) {
      for (const field of measurementFields) {
        const start = firstBody[field];
        const end = lastBody[field];
        if (start != null && end != null) {
          measurementsEvolution[field] = Math.round((end - start) * 100) / 100;
        }
      }
    }

    const physicalProgressEstimate =
      weightDelta != null
        ? weightDelta < 0
          ? `Perte de ${Math.abs(weightDelta)} kg cette semaine`
          : weightDelta > 0
          ? `Prise de ${weightDelta} kg cette semaine`
          : "Poids stable cette semaine"
        : "Aucune donnée de poids cette semaine";

    // ── AI Analysis ───────────────────────────────────────────────────────────
    // ── Note hebdomadaire (0-100) ─────────────────────────────────────────────
    const freqScore = Math.min(sessionsCount / 4, 1) * 35;
    const calProximity = goalsCalories > 0 ? Math.max(0, 100 - Math.abs(100 - caloriesPct)) : 0;
    const protScore = Math.min(proteinsPct, 100);
    const nutritionScore = (((calProximity * 0.4) + (protScore * 0.6)) / 100) * 40;
    const engagementScore = totalVolume > 0 ? 25 : sessionsCount > 0 ? 12 : 0;
    const weekScore = Math.max(0, Math.min(100, Math.round(freqScore + nutritionScore + engagementScore)));
    const weekGrade =
      weekScore >= 85 ? "A" : weekScore >= 70 ? "B" : weekScore >= 55 ? "C" : weekScore >= 40 ? "D" : "E";
    const scoreBreakdown = {
      frequence: Math.round(freqScore),
      nutrition: Math.round(nutritionScore),
      engagement: Math.round(engagementScore),
    };

    let aiAnalysis = { strengths: [] as string[], weaknesses: [] as string[], risks: [] as string[], recommendations: [] as string[] };

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY && (sessionsCount + nutritionLogs.length) > 0) {
      try {
        const prompt = `Analyse ces données fitness hebdomadaires et génère une analyse en FRANÇAIS.
- Séances d'entraînement: ${sessionsCount}, durée totale: ${totalTrainingTime} min
- Volume total: ${Math.round(totalVolume)} kg
- Exercices principaux: ${topExercises.map((e) => e.name).join(", ") || "aucun"}
- Calories moyennes/jour: ${avgCalories} (objectif: ${goalsCalories})
- Protéines moyennes/jour: ${avgProteins}g (objectif: ${goalsProtein}g)
- Respect des objectifs nutritionnels: ${goalsRespectPct}%
- Évolution du poids: ${physicalProgressEstimate}\n- Note globale de la semaine: ${weekScore}/100 (grade ${weekGrade})`;

        const tool = {
          type: "function",
          function: {
            name: "save_analysis",
            description: "Sauvegarder l'analyse hebdomadaire structurée",
            parameters: {
              type: "object",
              properties: {
                strengths: { type: "array", items: { type: "string" }, description: "3 points forts de la semaine" },
                weaknesses: { type: "array", items: { type: "string" }, description: "3 axes d'amélioration" },
                risks: { type: "array", items: { type: "string" }, description: "Risques détectés (surmenage, carences, etc.)" },
                recommendations: { type: "array", items: { type: "string" }, description: "3 à 5 recommandations pour la semaine suivante" },
              },
              required: ["strengths", "weaknesses", "risks", "recommendations"],
              additionalProperties: false,
            },
          },
        };

        // Modèles essayés dans l'ordre ; on retombe sur le suivant si surcharge (503/429).
        const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        outer:
        for (const model of models) {
          for (let attempt = 0; attempt < 3; attempt++) {
            const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
              signal: AbortSignal.timeout(30_000),
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                tools: [tool],
                tool_choice: { type: "function", function: { name: "save_analysis" } },
              }),
            });

            if (aiRes.ok) {
              const aiJson = await aiRes.json();
              const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
              if (call) {
                aiAnalysis = JSON.parse(call.function.arguments);
                break outer;
              }
              break; // réponse OK mais sans tool_call : on passe au modèle suivant
            }

            // 503 (surcharge) ou 429 (quota) : on réessaie avec un backoff, sinon on abandonne ce modèle.
            if (aiRes.status === 503 || aiRes.status === 429) {
              if (attempt < 2) {
                await sleep(700 * (attempt + 1));
                continue;
              }
              break; // épuisé les essais pour ce modèle → modèle suivant
            }

            // Autre erreur (4xx) : inutile de réessayer.
            console.error("[generate-weekly-report] AI error:", aiRes.status, (await aiRes.text()).slice(0, 300));
            break outer;
          }
        }
      } catch (e) {
        console.error("[generate-weekly-report] AI error:", e);
      }
    }

    // Template fallback si l'IA n'a pas répondu
    if (!aiAnalysis.strengths.length) {
      aiAnalysis = {
        strengths: [
          sessionsCount >= 3 ? `${sessionsCount} séances réalisées — bonne régularité` : "Activité physique maintenue cette semaine",
          avgProteins >= (goalsProtein * 0.8) ? "Apports protéiques corrects" : "Effort de suivi nutritionnel noté",
          totalVolume > 0 ? `Volume d'entraînement: ${Math.round(totalVolume)} kg au total` : "Présence à l'entraînement",
        ],
        weaknesses: [
          sessionsCount < 3 ? "Fréquence d'entraînement insuffisante (objectif: 3+ séances/semaine)" : "Certains groupes musculaires peuvent être négligés",
          avgCalories < goalsCalories * 0.8 ? "Apports caloriques en dessous de l'objectif" : "Nutrition encore perfectible",
          "Suivi de la récupération et du sommeil à améliorer",
        ],
        risks: [
          ...(sessionsCount > 6 ? ["Risque de surmenage — prévoir au moins un jour de repos complet"] : []),
          ...(avgProteins < goalsProtein * 0.6 ? ["Apports protéiques insuffisants pour une bonne récupération musculaire"] : []),
        ],
        recommendations: [
          sessionsCount < 3 ? "Viser 3 à 4 séances d'entraînement la semaine prochaine" : "Maintenir la fréquence d'entraînement actuelle",
          "Prioriser les exercices polyarticulaires (squat, développé couché, soulevé de terre)",
          avgProteins < goalsProtein * 0.8 ? `Augmenter les protéines à ${goalsProtein}g/jour` : "Maintenir les apports protéiques actuels",
          "Optimiser le sommeil pour maximiser la récupération musculaire",
        ],
      };
    }

    // ── Build & upsert report ─────────────────────────────────────────────────
    const { data: report, error: insertErr } = await supa
      .from("weekly_reports")
      .upsert(
        {
          user_id: userId,
          week_start: weekStart,
          week_end: weekEnd,
          summary: {
            sessions_count: sessionsCount,
            total_training_time: totalTrainingTime,
            weekly_frequency: sessionsCount,
            avg_calories: avgCalories,
            avg_proteins: avgProteins,
            current_weight: weightEnd,
            weight_evolution: weightDelta,
            goals_respect_pct: goalsRespectPct,
            week_score: weekScore,
            week_grade: weekGrade,
            score_breakdown: scoreBreakdown,
          },
          fitness_data: {
            top_exercises: topExercises,
            total_volume: Math.round(totalVolume),
            charge_progression: [],
            personal_records: [],
            recovery_analysis: `${sessionsCount} séance${sessionsCount !== 1 ? "s" : ""} cette semaine`,
            most_worked_muscles: topExercises.slice(0, 3).map((e) => e.name),
            neglected_muscles: [],
          },
          nutrition_data: {
            avg_calories: avgCalories,
            avg_proteins: avgProteins,
            avg_carbs: avgCarbs,
            avg_fats: avgFats,
            goals_respect_pct: goalsRespectPct,
            best_days: bestDays,
            worst_days: worstDays,
          },
          body_data: {
            weight_start: weightStart,
            weight_end: weightEnd,
            weight_delta: weightDelta,
            measurements_evolution: measurementsEvolution,
            physical_progress_estimate: physicalProgressEstimate,
          },
          ai_analysis: aiAnalysis,
          status: "ready",
        },
        { onConflict: "user_id,week_start" },
      )
      .select()
      .single();

    if (insertErr) return fail("Erreur lors de la sauvegarde du rapport", 500, insertErr);

    return ok(report);
  } catch (e) {
    return fail("Erreur interne", 500, e);
  }
});
