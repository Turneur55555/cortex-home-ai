// ============================================================
// Domaine pur — dérive la liste "exercices récents" (dédupliqués par nom
// normalisé, dernières valeurs connues) depuis un historique de séances.
// Extrait pour être partagé entre le picker en séance active
// (ActiveWorkoutView) et l'éditeur de modèles de séance (TemplateEditorSheet)
// — même logique, deux points d'entrée, zéro duplication.
// ============================================================

import { normalize } from "./exerciseCatalog";

export type RecentExercise = {
  name: string;
  lastSets: number | null;
  lastReps: number | null;
  lastWeight: number | null;
};

export interface WorkoutExerciseLike {
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
}

export interface WorkoutLike {
  exercises?: ReadonlyArray<WorkoutExerciseLike> | null;
}

/** `workouts` doit déjà être trié le plus récent en premier (comme
 *  `useWorkouts()`) — le premier exercice rencontré pour un nom donné
 *  l'emporte. */
export function computeRecentExercises(
  workouts: ReadonlyArray<WorkoutLike> | undefined,
  limit = 30,
): RecentExercise[] {
  if (!workouts) return [];
  const seen = new Map<string, RecentExercise>();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name.trim()) continue;
      const key = normalize(ex.name);
      if (!seen.has(key)) {
        seen.set(key, {
          name: ex.name,
          lastSets: ex.sets ?? null,
          lastReps: ex.reps ?? null,
          lastWeight: ex.weight ?? null,
        });
      }
    }
  }
  return Array.from(seen.values()).slice(0, limit);
}
