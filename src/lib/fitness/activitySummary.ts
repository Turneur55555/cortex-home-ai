// Pure domain helpers for the weekly activity summary (Santé nutritionnelle
// module, section "Activité"). No React, no Supabase, no UI tokens.

import { estimateWorkoutCalories } from "./calories";
import { workoutTonnage } from "./strength";

type SetForSummary = {
  reps?: number | string | null;
  weight?: number | string | null;
  completed?: boolean | null;
};

type ExerciseForSummary = {
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  exercise_sets?: SetForSummary[] | null;
};

export type WorkoutForSummary = {
  date: string;
  duration_minutes: number | null;
  exercises?: ExerciseForSummary[] | null;
};

export interface WeeklyActivitySummary {
  sessionCount: number;
  caloriesBurned: number;
}

/**
 * Nombre de séances et calories brûlées estimées sur les `days` derniers
 * jours. Réutilise `workoutTonnage` et `estimateWorkoutCalories`, déjà
 * responsables de l'estimation calorique affichée par séance (WorkoutCard).
 */
export function computeWeeklyActivitySummary(
  workouts: ReadonlyArray<WorkoutForSummary> | undefined,
  bodyWeightKg: number | null | undefined,
  days = 7,
): WeeklyActivitySummary {
  if (!workouts || workouts.length === 0) return { sessionCount: 0, caloriesBurned: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = workouts.filter((w) => new Date(w.date + "T00:00:00") >= cutoff);

  let caloriesBurned = 0;
  for (const w of recent) {
    const volume = workoutTonnage(w.exercises ?? []);
    const calories = estimateWorkoutCalories({
      durationMinutes: w.duration_minutes ?? 0,
      volumeKg: volume,
      bodyWeightKg: bodyWeightKg ?? null,
    });
    if (calories != null) caloriesBurned += calories;
  }

  return { sessionCount: recent.length, caloriesBurned: Math.round(caloriesBurned) };
}
