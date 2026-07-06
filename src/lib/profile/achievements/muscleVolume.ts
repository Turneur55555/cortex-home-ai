// ============================================================
// Agrégation volume / activité par groupe musculaire et dans le temps.
// Domaine pur, aucun import React/Supabase. Ne duplique pas computePRs()
// (qui sert un besoin différent : top exercices par fréquence) — construit
// une vue plus large à partir des mêmes séances brutes, pour les besoins de
// la Progression RPG (répartition, catégorie dominante, activité récente).
// ============================================================

import { normalize, CATALOG_GROUPS, EXERCISE_CATALOG } from "@/lib/fitness/exerciseCatalog";

export interface WorkoutExerciseLike {
  name: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
}

export interface WorkoutLike {
  date: string; // YYYY-MM-DD
  exercises?: WorkoutExerciseLike[] | null;
}

const GROUP_BY_NORMALIZED_NAME = new Map<string, string>(
  EXERCISE_CATALOG.map((e) => [normalize(e.name), e.group]),
);

function groupForExercise(name: string): string {
  const key = normalize(name);
  const exact = GROUP_BY_NORMALIZED_NAME.get(key);
  if (exact) return exact;
  // Repli : correspondance partielle (ex. variante non cataloguée).
  for (const [catKey, group] of GROUP_BY_NORMALIZED_NAME) {
    if (key.includes(catKey) || catKey.includes(key)) return group;
  }
  return "Polyarticulaire";
}

export interface BroadActivitySummary {
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  distinctExerciseCount: number;
  distinctMonthsActive: number;
  distinctWeeksActive: number;
  longestWeeklyStreak: number;
  muscleGroupVolume: Map<string, number>;
  dominantMuscleGroup: string | null;
  categoriesTrainedCount: number;
  /** Top exercices par fréquence, plus large que computePRs() (jusqu'à `limit`). */
  broadExercises: string[];
  nameByKey: Map<string, string>;
}

/**
 * Semaine ISO-ish simplifiée (année + n° de semaine depuis le 1er janvier) —
 * suffisant pour détecter des semaines consécutives, pas besoin de la norme
 * ISO 8601 exacte ici.
 */
function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const year = d.getFullYear();
  const firstJan = new Date(year, 0, 1);
  const days = Math.floor((d.getTime() - firstJan.getTime()) / 86_400_000);
  const week = Math.floor((days + firstJan.getDay()) / 7);
  return `${year}-W${week}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function computeBroadActivity(
  workouts: WorkoutLike[] | null | undefined,
  broadLimit = 8,
): BroadActivitySummary {
  const empty: BroadActivitySummary = {
    totalVolume: 0,
    totalSets: 0,
    totalReps: 0,
    distinctExerciseCount: 0,
    distinctMonthsActive: 0,
    distinctWeeksActive: 0,
    longestWeeklyStreak: 0,
    muscleGroupVolume: new Map(),
    dominantMuscleGroup: null,
    categoriesTrainedCount: 0,
    broadExercises: [],
    nameByKey: new Map(),
  };
  if (!workouts || workouts.length === 0) return empty;

  const muscleGroupVolume = new Map<string, number>();
  const freq = new Map<string, number>();
  const nameByKey = new Map<string, string>();
  const exerciseKeys = new Set<string>();
  const months = new Set<string>();
  const weeks = new Set<string>();
  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;

  for (const w of workouts) {
    months.add(monthKey(w.date));
    weeks.add(weekKey(w.date));
    for (const ex of w.exercises ?? []) {
      const key = normalize(ex.name);
      if (!key) continue;
      if (!nameByKey.has(key)) nameByKey.set(key, ex.name.trim());
      exerciseKeys.add(key);
      freq.set(key, (freq.get(key) ?? 0) + 1);

      const hasExplicitWeight = ex.weight != null;
      const reps = hasExplicitWeight ? ex.reps : (ex.sets ?? ex.reps);
      const weight = hasExplicitWeight ? ex.weight : ex.sets != null ? ex.reps : null;
      const setCount = 1; // une ligne exercice ≈ une série consolidée (même grain que computePRs)
      totalSets += setCount;
      if (reps != null) totalReps += reps;
      if (weight != null) {
        const vol = (reps ?? 1) * weight;
        totalVolume += vol;
        const group = groupForExercise(ex.name);
        muscleGroupVolume.set(group, (muscleGroupVolume.get(group) ?? 0) + vol);
      }
    }
  }

  // Plus longue série de semaines consécutives avec au moins une séance.
  const sortedWeeks = Array.from(weeks).sort();
  let longestWeeklyStreak = 0;
  let current = 0;
  let prevYear = -1;
  let prevWeek = -1;
  for (const wk of sortedWeeks) {
    const [yStr, wStr] = wk.split("-W");
    const y = Number(yStr);
    const wNum = Number(wStr);
    if (prevYear === y && wNum === prevWeek + 1) {
      current += 1;
    } else if (prevYear === y && wNum === prevWeek) {
      // même semaine, ignore
    } else {
      current = 1;
    }
    longestWeeklyStreak = Math.max(longestWeeklyStreak, current);
    prevYear = y;
    prevWeek = wNum;
  }

  let dominantMuscleGroup: string | null = null;
  let maxVol = 0;
  for (const [group, vol] of muscleGroupVolume) {
    if (vol > maxVol) {
      maxVol = vol;
      dominantMuscleGroup = group;
    }
  }

  const trainedGroups = new Set(muscleGroupVolume.keys());
  const broadExercises = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && exerciseKeys.has(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, broadLimit)
    .map(([k]) => k);

  return {
    totalVolume,
    totalSets,
    totalReps,
    distinctExerciseCount: exerciseKeys.size,
    distinctMonthsActive: months.size,
    distinctWeeksActive: weeks.size,
    longestWeeklyStreak,
    muscleGroupVolume,
    dominantMuscleGroup,
    categoriesTrainedCount: trainedGroups.size,
    broadExercises,
    nameByKey,
  };
}

export { CATALOG_GROUPS };
