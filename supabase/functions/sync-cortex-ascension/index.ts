// Recalcule ENTIÈREMENT côté serveur la chaîne Performance → Rang exercice
// → Rang musculaire → Puissance Cortex → Titre, et n'enregistre une
// Ascension que si CE calcul serveur (jamais une valeur envoyée par le
// client) constate un changement de Titre réel — voir migration
// 20260830120000_cortex_ascension_server_only.sql (audit RPG V2 Phase H).
//
// Le client n'envoie AUCUN paramètre métier : seule son identité (JWT) est
// utilisée. Le serveur reconstruit lui-même :
//   - l'historique complet de séances (exercise_sets/exercises/workouts,
//     RLS scopée à l'appelant — un user ne peut lire que ses propres
//     données) ;
//   - le poids de corps le plus récent (body_tracking) ;
// puis recalcule via des copies fidèles des moteurs TypeScript client :
//   - `_shared/rankEngine.ts` (déjà utilisé par `verify-exercise-rank`,
//     parité garantie par
//     src/lib/fitness/rank/rankEngine.sql-parity.test.ts) — Rang par
//     exercice, fenêtre 45 jours + confirmation de rétrogradation ≥ 2
//     semaines incluses (logique inchangée, pas dupliquée différemment) ;
//   - `_shared/cortexEngine.ts` (parité garantie par
//     src/lib/fitness/rpg/cortexEngine.sql-parity.test.ts) — Rang
//     musculaire (Méthode C) puis Puissance Cortex (Option 1).
//
// Le `tier_index` obtenu est le SEUL utilisé pour appeler
// `record_cortex_ascension` (service role) — la fonction elle-même
// re-vérifie la monotonicité et le changement de Titre en base (défense en
// profondeur). Toujours HTTP 200, même en erreur (convention des autres
// Edge Functions Cortex).
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";
import { computeConfirmedTier, type SessionInput } from "../_shared/rankEngine.ts";
import {
  aggregateMuscleRanks,
  computeCortexPower,
  identityKey,
  type BusteMuscleGroup,
  type RankedExercise,
} from "../_shared/cortexEngine.ts";

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
    if (detail) console.warn("[sync-cortex-ascension] FAIL:", userMsg, detail);
    else console.warn("[sync-cortex-ascension] FAIL:", userMsg);
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

    const rl = await checkRateLimit(supaUser, userId, "sync_cortex_ascension", 60);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/60 par heure). Réessaie plus tard.`);

    // ── Historique brut COMPLET (toutes séances complétées), scopé RLS ──
    const { data: exerciseRows, error: exErr } = await supaUser
      .from("exercises")
      .select("id, workout_id, exercise_reference_id, name, workouts!inner(id, date, status)")
      .eq("user_id", userId)
      .eq("workouts.status", "completed");
    if (exErr) return fail("Lecture de l'historique impossible.", exErr.message);

    const exerciseIds = (exerciseRows ?? []).map((r: any) => r.id as string);
    const setsByExercise = new Map<
      string,
      { reps: number | null; weight: number | null }[]
    >();
    if (exerciseIds.length > 0) {
      const { data: setRows, error: setErr } = await supaUser
        .from("exercise_sets")
        .select("exercise_id, reps, weight, completed")
        .in("exercise_id", exerciseIds)
        .eq("completed", true)
        .not("reps", "is", null)
        .gt("reps", 0);
      if (setErr) return fail("Lecture des séries impossible.", setErr.message);
      for (const s of setRows ?? []) {
        const list = setsByExercise.get((s as any).exercise_id) ?? [];
        list.push({ reps: (s as any).reps, weight: (s as any).weight });
        setsByExercise.set((s as any).exercise_id, list);
      }
    }

    // ── Poids de corps le plus récent connu ──
    const { data: bodyRows } = await supaUser
      .from("body_tracking")
      .select("weight, date")
      .eq("user_id", userId)
      .not("weight", "is", null)
      .order("date", { ascending: false })
      .limit(1);
    const bodyweightKg = bodyRows?.[0]?.weight ?? DEFAULT_BODYWEIGHT_KG;

    // ── Regroupement par identité d'exercice (même clé que le client) ──
    const sessionsByKey = new Map<string, SessionInput[]>();
    const nameByKey = new Map<string, string>();
    for (const r of exerciseRows ?? []) {
      const sets = setsByExercise.get((r as any).id) ?? [];
      if (sets.length === 0) continue;
      const key = identityKey({
        name: (r as any).name,
        exercise_reference_id: (r as any).exercise_reference_id,
      });
      if (!nameByKey.has(key)) nameByKey.set(key, ((r as any).name as string).trim());
      const list = sessionsByKey.get(key) ?? [];
      list.push({
        workoutId: (r as any).workout_id,
        date: (r as any).workouts.date,
        sets,
      });
      sessionsByKey.set(key, list);
    }

    // ── Rang par exercice (moteur serveur, fenêtre 45j + durabilité) ──
    const rankedExercises: RankedExercise[] = [];
    for (const [key, sessions] of sessionsByKey) {
      const name = nameByKey.get(key) ?? key;
      const result = computeConfirmedTier(name, sessions, bodyweightKg);
      rankedExercises.push({ key, name, tierIndex: result.confirmedTierIndex });
    }

    // ── Rang musculaire (Méthode C) → Puissance Cortex (Option 1) ──
    const muscleRanks = aggregateMuscleRanks(rankedExercises);
    const powerInputs = Object.entries(muscleRanks).map(([muscle, result]) => ({
      muscle: muscle as BusteMuscleGroup,
      tierIndex: result.status === "evaluated" ? result.tierIndex : null,
    }));
    const power = computeCortexPower(powerInputs);

    await recordRateLimit(supaUser, userId, "sync_cortex_ascension");

    if (power.status !== "complete") {
      // Pas assez de muscles évalués (< 5/8) : pas de Titre, donc pas
      // d'Ascension possible — rien à enregistrer, ce n'est pas une erreur.
      return json200({ status: "partial", evaluatedCount: power.evaluatedCount });
    }

    // ── Enregistrement (service role) — SEULE valeur transmise au RPC :
    //    le tier_index calculé ci-dessus, jamais une valeur cliente. ──
    const supaService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: rpcErr } = await supaService.rpc("record_cortex_ascension", {
      _user_id: userId,
      _tier_index: power.tierIndex,
    });
    if (rpcErr) {
      console.error("[sync-cortex-ascension] record failed:", rpcErr.message);
      return fail("Enregistrement de l'Ascension impossible.", rpcErr.message);
    }

    return json200({ status: "complete", tierIndex: power.tierIndex });
  } catch (e) {
    return fail("Erreur inattendue.", e instanceof Error ? e.message : String(e));
  }
});
