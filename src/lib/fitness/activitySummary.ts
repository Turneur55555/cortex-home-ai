// Pure domain helpers for the weekly activity summary (Santé nutritionnelle
// module, section "Activité"). No React, no Supabase, no UI tokens.

import { estimateSessionCalories, type WorkoutForEAT } from "./eat";

export type WorkoutForSummary = WorkoutForEAT;

export interface WeeklyActivitySummary {
  sessionCount: number;
  caloriesBurned: number;
}

/**
 * Nombre de séances et calories brûlées estimées sur les `days` derniers
 * jours. Réutilise `estimateSessionCalories` (eat.ts) — même estimateur
 * par séance que le tuile EAT, jamais une seconde logique concurrente.
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
    const estimate = estimateSessionCalories(w, bodyWeightKg);
    if (estimate != null) caloriesBurned += estimate.kcal;
  }

  return { sessionCount: recent.length, caloriesBurned: Math.round(caloriesBurned) };
}
