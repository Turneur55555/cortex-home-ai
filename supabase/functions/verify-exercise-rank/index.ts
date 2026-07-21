// Recalcule ENTIÈREMENT le Rang d'un exercice côté serveur (aucune confiance
// cliente, même partielle — voir migration 20260721130000). Le client
// n'envoie que l'identité de l'exercice ; le serveur reconstruit lui-même
// l'historique complet (exercise_sets/exercises/workouts) + le poids de
// corps (body_tracking), recalcule le Rang via une copie fidèle du VRAI
// moteur TypeScript (../_shared/rankEngine.ts, parité garantie par
// src/lib/fitness/rank/rankEngine.sql-parity.test.ts), et verse l'XP
// correspondante (une seule fois par exercice et par Titre franchi) via le
// service role. Toujours HTTP 200, même en erreur (voir autres functions).
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";
import {
  computeConfirmedTier,
  RANK_KEYS,
  LEVELS_PER_RANK,
  type SessionInput,
} from "../_shared/rankEngine.ts";

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

const DEFAULT_BODYWEIGHT_KG = 75;

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json200 = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  const fail = (userMsg: string, detail?: unknown) => {
    if (detail) console.warn("[verify-exercise-rank] FAIL:", userMsg, detail);
    else console.warn("[verify-exercise-rank] FAIL:", userMsg);
    return json200({ error: userMsg });
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client scopé RLS (l'utilisateur ne peut lire QUE ses propres données).
    const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);
    const userId = userData.user.id;

    const rl = await checkRateLimit(supaUser, userId, "verify_exercise_rank", 60);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/60 par heure). Réessaie plus tard.`);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps invalide (JSON attendu).", e instanceof Error ? e.message : String(e));
    }

    const exerciseName = typeof body.exercise_name === "string" ? body.exercise_name : null;
    const exerciseReferenceId =
      typeof body.exercise_reference_id === "string" ? body.exercise_reference_id : null;
    if (!exerciseName && !exerciseReferenceId) {
      return fail("exercise_name ou exercise_reference_id requis.");
    }

    // ── Historique brut de CET exercice, séances complétées uniquement ──
    let exercisesQuery = supaUser
      .from("exercises")
      .select("id, workout_id, exercise_reference_id, name, workouts!inner(id, date, status)")
      .eq("user_id", userId)
      .eq("workouts.status", "completed");
    if (exerciseReferenceId) {
      exercisesQuery = exercisesQuery.eq("exercise_reference_id", exerciseReferenceId);
    } else {
      exercisesQuery = exercisesQuery.ilike("name", exerciseName!.trim());
    }
    const { data: exerciseRows, error: exErr } = await exercisesQuery;
    if (exErr) return fail("Lecture de l'historique impossible.", exErr.message);
    if (!exerciseRows || exerciseRows.length === 0) {
      return json200({ granted: [], tierIndex: 0 });
    }

    const exerciseIds = exerciseRows.map((r: any) => r.id as string);
    const { data: setRows, error: setErr } = await supaUser
      .from("exercise_sets")
      .select("exercise_id, reps, weight")
      .in("exercise_id", exerciseIds);
    if (setErr) return fail("Lecture des séries impossible.", setErr.message);

    const setsByExercise = new Map<string, { reps: number | null; weight: number | null }[]>();
    for (const s of setRows ?? []) {
      const list = setsByExercise.get((s as any).exercise_id) ?? [];
      list.push({ reps: (s as any).reps, weight: (s as any).weight });
      setsByExercise.set((s as any).exercise_id, list);
    }

    const sessions: SessionInput[] = exerciseRows.map((r: any) => ({
      workoutId: r.workout_id,
      date: r.workouts.date,
      sets: setsByExercise.get(r.id) ?? [],
    }));

    // ── Poids de corps le plus récent connu ──
    const { data: bodyRows } = await supaUser
      .from("body_tracking")
      .select("weight, date")
      .eq("user_id", userId)
      .not("weight", "is", null)
      .order("date", { ascending: false })
      .limit(1);
    const bodyweightKg = bodyRows?.[0]?.weight ?? DEFAULT_BODYWEIGHT_KG;

    // ── Recalcul ENTIER du Rang, côté serveur ──
    const result = computeConfirmedTier(exerciseName ?? exerciseRows[0].name, sessions, bodyweightKg);
    const titreIndex = Math.floor(result.confirmedTierIndex / LEVELS_PER_RANK);
    const exerciseKey = exerciseReferenceId ?? exerciseName!.trim().toLowerCase();

    // ── Versement (service role) : un Titre à la fois, jamais deux fois ──
    const supaService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const granted: string[] = [];
    for (let band = 0; band <= titreIndex; band++) {
      const titreKey = RANK_KEYS[band];
      const sourceKey = `exercise_rank_up_${titreKey}`;
      const { data: catalogRow } = await supaService
        .from("reward_catalog")
        .select("xp_amount, active")
        .eq("source_key", sourceKey)
        .maybeSingle();
      if (!catalogRow?.active) continue;

      const dedupKey = `exercise_rank_up:${exerciseKey}:${titreKey}`;
      const { error: awardErr } = await supaService.rpc("award_character_xp", {
        _user_id: userId,
        _source: sourceKey,
        _amount: catalogRow.xp_amount,
        _workout_id: null,
        _dedup_key: dedupKey,
      });
      if (awardErr) {
        console.error("[verify-exercise-rank] award failed:", awardErr.message);
        continue;
      }
      granted.push(titreKey);
    }

    await recordRateLimit(supaUser, userId, "verify_exercise_rank");

    return json200({
      tierIndex: result.confirmedTierIndex,
      titre: RANK_KEYS[titreIndex],
      granted,
    });
  } catch (e) {
    return fail("Erreur inattendue.", e instanceof Error ? e.message : String(e));
  }
});
