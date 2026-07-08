// ============================================================
// Auto-profil Sensei (niveau + objectif) — domaine pur, zéro React.
//
// Remplace les questions "Quel est ton niveau ?" / "Quel est ton
// objectif ?" du dialogue Sensei pour la musculation (seul appelant :
// StrengthWorkoutEngine) : au lieu de les demander, ce module les
// déduit de l'historique réel de séances déjà enregistrées — charges,
// séries, répétitions, volume par séance et par semaine, surcharge
// progressive, records personnels, fréquence, tendances récentes de
// progression/stagnation. Plus l'historique s'étoffe, plus
// l'estimation se précise.
//
// NB : le RIR n'entre pas dans le calcul — la colonne exercise_sets.rpe
// a été supprimée le 02/07/2026 ("pas de RPE dans l'app", voir
// 20260702100030_seances_status_completed_drop_rpe.sql) : aucune
// donnée n'existe pour ce signal.
//
// En dessous du seuil minimal de séances exploitables, on retombe sur
// les valeurs par défaut historiques du dialogue (intermédiaire /
// hypertrophie) plutôt que de deviner sans signal.
// ============================================================

import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";

export type AutoLevel = "débutant" | "intermédiaire" | "avancé";
export type AutoGoal = "hypertrophie" | "force" | "endurance" | "perte de poids";

export interface AutoProfileSet {
  reps: number | null;
  weight: number | null;
  completed?: boolean | null;
}

export interface AutoProfileExercise {
  name: string;
  exercise_sets?: AutoProfileSet[] | null;
}

export interface AutoProfileWorkout {
  date: string; // YYYY-MM-DD
  discipline?: string | null;
  exercises?: AutoProfileExercise[] | null;
}

export interface SenseiAutoProfile {
  level: AutoLevel;
  goal: AutoGoal;
  /** Nombre de séances musculation réellement prises en compte — permet à
   *  l'appelant d'afficher une nuance ("estimation encore approximative"). */
  sessionsConsidered: number;
}

const MIN_SESSIONS = 3;
const DEFAULT_PROFILE: Omit<SenseiAutoProfile, "sessionsConsidered"> = {
  level: "intermédiaire",
  goal: "hypertrophie",
};

/** Semaine ISO-ish simplifiée (année + n° de semaine depuis le 1er janvier),
 *  même convention que src/lib/profile/achievements/muscleVolume.ts. */
function weekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const firstJan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - firstJan.getTime()) / 86_400_000);
  return `${d.getFullYear()}-W${Math.floor((days + firstJan.getDay()) / 7)}`;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
}

export function inferSenseiAutoProfile(
  workouts: ReadonlyArray<AutoProfileWorkout> | null | undefined,
): SenseiAutoProfile {
  const sessions = (workouts ?? [])
    .filter((w) => (w.discipline ?? "muscu") === "muscu")
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (sessions.length < MIN_SESSIONS) {
    return { ...DEFAULT_PROFILE, sessionsConsidered: sessions.length };
  }

  let totalSets = 0;
  let totalReps = 0;
  const weeklyTonnage = new Map<string, number>();
  const weeklyMuscles = new Map<string, Set<string>>();
  // Poids validé le plus lourd par exercice, dans l'ordre chronologique —
  // alimente à la fois la surcharge progressive et les records récents.
  const topWeightsByExercise = new Map<string, number[]>();

  for (const w of sessions) {
    const wk = weekKey(w.date);
    const muscles = weeklyMuscles.get(wk) ?? new Set<string>();
    let sessionTonnage = 0;

    for (const ex of w.exercises ?? []) {
      const validSets = (ex.exercise_sets ?? []).filter(
        (s) => s.completed !== false && s.reps != null && s.reps > 0,
      );
      if (validSets.length === 0) continue;

      let topWeight = 0;
      for (const s of validSets) {
        totalSets += 1;
        totalReps += s.reps ?? 0;
        const weight = s.weight ?? 0;
        if (weight > 0) {
          sessionTonnage += weight * (s.reps ?? 0);
          if (weight > topWeight) topWeight = weight;
        }
      }

      if (topWeight > 0) {
        const key = ex.name.trim().toLowerCase();
        const history = topWeightsByExercise.get(key) ?? [];
        history.push(topWeight);
        topWeightsByExercise.set(key, history);
        for (const muscle of exerciseToMuscles(ex.name)) muscles.add(muscle);
      }
    }

    if (sessionTonnage > 0) {
      weeklyTonnage.set(wk, (weeklyTonnage.get(wk) ?? 0) + sessionTonnage);
    }
    weeklyMuscles.set(wk, muscles);
  }

  // Séances enregistrées mais sans aucune série validée exploitable (ex:
  // séances abandonnées en cours) — aucun signal réel, on retombe sur les
  // valeurs par défaut plutôt que de déduire un profil d'un historique vide.
  if (totalSets === 0) {
    return { ...DEFAULT_PROFILE, sessionsConsidered: sessions.length };
  }

  const avgRepsPerSet = totalReps / totalSets;

  const firstDate = new Date(sessions[0].date);
  const lastDate = new Date(sessions[sessions.length - 1].date);
  const weeksSpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (7 * 86_400_000));
  const weeklyFrequency = sessions.length / weeksSpan;

  // Surcharge progressive + records récents : sur chaque exercice suivi sur
  // >= 3 séances, la charge la plus récente dépasse-t-elle la première, et
  // s'agit-il d'un nouveau record jamais atteint auparavant ?
  let trackedExercises = 0;
  let progressingExercises = 0;
  let recentPRCount = 0;
  for (const history of topWeightsByExercise.values()) {
    if (history.length < 3) continue;
    trackedExercises += 1;
    const first = history[0];
    const last = history[history.length - 1];
    if (last > first) progressingExercises += 1;
    const priorMax = Math.max(...history.slice(0, -1));
    if (last > priorMax) recentPRCount += 1;
  }
  const progressionRatio = trackedExercises > 0 ? progressingExercises / trackedExercises : 0;

  // Tendance de volume hebdomadaire : moitié récente vs moitié ancienne des
  // semaines réellement entraînées (plus robuste face à un rythme
  // d'entraînement irrégulier qu'une comparaison séance par séance).
  const weeks = Array.from(weeklyTonnage.keys()).sort();
  const mid = Math.floor(weeks.length / 2);
  const olderAvg = average(weeks.slice(0, mid).map((w) => weeklyTonnage.get(w)!));
  const recentAvg = average(weeks.slice(mid).map((w) => weeklyTonnage.get(w)!));
  const tonnageTrend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  // Amplitude du travail musculaire sur les 4 dernières semaines entraînées.
  const muscleBreadth = new Set<string>();
  for (const wk of weeks.slice(-4)) {
    for (const m of weeklyMuscles.get(wk) ?? []) muscleBreadth.add(m);
  }

  // ---- Niveau : plus de séances, plus de fréquence, une surcharge qui
  // tient dans la durée et un travail musculaire large font monter le score.
  let levelScore = 0;
  if (sessions.length >= 25) levelScore += 2;
  else if (sessions.length >= 8) levelScore += 1;
  if (weeklyFrequency >= 2.5) levelScore += 2;
  else if (weeklyFrequency >= 1.2) levelScore += 1;
  if (progressionRatio >= 0.5) levelScore += 1;
  if (recentPRCount >= 2) levelScore += 1;
  if (muscleBreadth.size >= 6) levelScore += 1;

  const level: AutoLevel =
    levelScore >= 6 ? "avancé" : levelScore >= 3 ? "intermédiaire" : "débutant";

  // ---- Objectif : la plage de répétitions réellement pratiquée reste le
  // signal principal ; au-delà de 12 reps, une fréquence élevée sans
  // surcharge de volume distingue un profil "dépense/perte de poids" d'une
  // vraie progression d'endurance structurée.
  let goal: AutoGoal;
  if (avgRepsPerSet <= 6) {
    goal = "force";
  } else if (avgRepsPerSet <= 12) {
    goal = "hypertrophie";
  } else if (weeklyFrequency >= 3 && tonnageTrend <= 0) {
    goal = "perte de poids";
  } else {
    goal = "endurance";
  }

  return { level, goal, sessionsConsidered: sessions.length };
}
