import { identityKey } from "@/lib/fitness/recentExercises";
import { computeRankState } from "@/lib/fitness/rank/engine";
import { DEFAULT_RANK_ENGINE_CONFIG } from "@/lib/fitness/rank/config";
import { toRankState } from "@/hooks/useExerciseProgression";
import type { RankState } from "@/lib/fitness/exerciseRanks";

type WorkoutWithExercises = {
  id: string;
  date: string;
  name: string;
  gym_location?: string | null;
  exercises?: Array<{
    id: string;
    name: string;
    weight: number | null;
    sets: number | null;
    reps: number | null;
    image_path?: string | null;
    /** Étape 4.6 : priorité d'identité (voir identityKey), additif. */
    exercise_reference_id?: string | null;
    /** Carte de séance V2 (2026-07-29) : séries détaillées déjà chargées par
     *  useWorkouts (`exercises(*, exercise_sets(...))`) — permet de calculer
     *  le rang RPG de chaque exercice en un seul passage client, sans
     *  requête supplémentaire par exercice (voir computeRanksByName). */
    exercise_sets?: Array<{
      reps: number | null;
      weight: number | null;
      completed?: boolean | null;
    }> | null;
  }> | null;
};

export function computePRs(workouts: WorkoutWithExercises[] | null | undefined) {
  const prByName = new Map<string, number>();
  const histByName = new Map<string, Array<{ date: string; weight: number }>>();
  const volByName = new Map<string, Array<{ date: string; volume: number }>>();
  const prByGym = new Map<string, Map<string, number>>();
  const histByGym = new Map<string, Map<string, Array<{ date: string; weight: number }>>>();
  const freq = new Map<string, number>();
  const nameByKey = new Map<string, string>();

  if (!workouts)
    return {
      prByName,
      histByName,
      volByName,
      prByGym,
      histByGym,
      nameByKey,
      topExercises: [] as string[],
    };

  for (const w of workouts) {
    const sessionMax = new Map<string, number>();
    const sessionVol = new Map<string, number>();
    const gym = (w.gym_location ?? "Salle inconnue") || "Salle inconnue";

    for (const ex of w.exercises ?? []) {
      if (!ex.name.trim()) continue;
      // Étape 4.6 : identité par exercise_reference_id en priorité (même
      // fonction que les hooks déjà migrés), filet par nom normalisé sinon.
      const key = identityKey({ name: ex.name, exercise_reference_id: ex.exercise_reference_id });
      if (!nameByKey.has(key)) nameByKey.set(key, ex.name.trim());
      freq.set(key, (freq.get(key) ?? 0) + 1);
      const hasExplicitWeight = ex.weight != null;
      const reps = hasExplicitWeight ? ex.reps : (ex.sets ?? ex.reps);
      const weight = hasExplicitWeight ? ex.weight : ex.sets != null ? ex.reps : null;
      if (weight != null) {
        if (!sessionMax.has(key) || weight > sessionMax.get(key)!) sessionMax.set(key, weight);
        if (!prByName.has(key) || weight > prByName.get(key)!) prByName.set(key, weight);
        const vol = (reps ?? 1) * weight;
        sessionVol.set(key, (sessionVol.get(key) ?? 0) + vol);

        // PR par salle
        if (!prByGym.has(gym)) prByGym.set(gym, new Map());
        const gymMap = prByGym.get(gym)!;
        if (!gymMap.has(key) || weight > gymMap.get(key)!) gymMap.set(key, weight);
      }
    }

    for (const [k, v] of sessionMax) {
      if (!histByName.has(k)) histByName.set(k, []);
      histByName.get(k)!.push({ date: w.date, weight: v });

      if (!histByGym.has(gym)) histByGym.set(gym, new Map());
      const gymHist = histByGym.get(gym)!;
      if (!gymHist.has(k)) gymHist.set(k, []);
      gymHist.get(k)!.push({ date: w.date, weight: v });
    }
    for (const [k, v] of sessionVol) {
      if (!volByName.has(k)) volByName.set(k, []);
      volByName.get(k)!.push({ date: w.date, volume: v });
    }
  }

  for (const arr of histByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  for (const arr of volByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  for (const gymMap of histByGym.values()) {
    for (const arr of gymMap.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  const topExercises = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && (histByName.get(k)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { prByName, histByName, volByName, prByGym, histByGym, nameByKey, topExercises };
}

/**
 * Dernières progressions (PR) parmi une liste d'exercices — extrait de la
 * Progression RPG du Profil pour être réutilisé tel quel (même formule,
 * aucun changement) par toute autre carte de progression (ex. Séances).
 */
export function computeRecentPRs(
  exerciseKeys: string[],
  prByName: Map<string, number>,
  histByName: Map<string, Array<{ date: string; weight: number }>>,
  nameByKey: Map<string, string>,
  limit = 2,
): Array<{ name: string; weight: number; date: string }> {
  const rows: { name: string; weight: number; date: string }[] = [];
  for (const key of exerciseKeys) {
    const pr = prByName.get(key);
    const hist = histByName.get(key);
    if (!pr || !hist || hist.length === 0) continue;
    const atPr = [...hist]
      .filter((h) => h.weight === pr)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (atPr.length === 0) continue;
    rows.push({ name: nameByKey.get(key) ?? key, weight: pr, date: atPr[0].date });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

/**
 * Rang RPG de chaque exercice, calculé en un seul passage sur les séances
 * déjà chargées (`useWorkouts`, qui contient déjà `exercise_sets` imbriqués)
 * — aucune requête supplémentaire, contrairement à `RankAggregator` (une
 * sonde `useExerciseProgression` par exercice, coûteuse pour 20-30
 * exercices dans une carte de séance). Utilisé par ActiveExerciseCard pour
 * afficher le badge de rang directement sur la carte.
 */
export function computeRanksByName(
  workouts: WorkoutWithExercises[] | null | undefined,
  bodyweightKg: number,
): Map<string, RankState> {
  const sessionsByKey = new Map<
    string,
    Array<{
      workoutId: string;
      date: string;
      sets: Array<{ reps: number | null; weight: number | null }>;
    }>
  >();
  const nameByKey = new Map<string, string>();

  for (const w of workouts ?? []) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name.trim()) continue;
      const sets = (ex.exercise_sets ?? [])
        .filter((s) => s.completed && s.reps != null && s.reps > 0)
        .map((s) => ({ reps: s.reps, weight: s.weight }));
      if (sets.length === 0) continue;

      const key = identityKey({ name: ex.name, exercise_reference_id: ex.exercise_reference_id });
      if (!nameByKey.has(key)) nameByKey.set(key, ex.name.trim());
      const list = sessionsByKey.get(key) ?? [];
      list.push({ workoutId: w.id, date: w.date, sets });
      sessionsByKey.set(key, list);
    }
  }

  const ranks = new Map<string, RankState>();
  for (const [key, sessions] of sessionsByKey) {
    const name = nameByKey.get(key) ?? key;
    const result = computeRankState(DEFAULT_RANK_ENGINE_CONFIG, name, sessions, bodyweightKg);
    ranks.set(key, toRankState(result.confirmedTierIndex, result.masteryPercent));
  }
  return ranks;
}
