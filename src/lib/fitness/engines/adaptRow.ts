// ============================================================
// Adaptateur ligne persistée → WorkoutRecordDraft.
//
// `engine.toSessionView()` attend un WorkoutRecordDraft — la même forme
// qu'avant sauvegarde (voir types.ts). Cette fonction reconstruit cette
// forme à partir d'une ligne `workouts` relue en base (useWorkouts()),
// afin qu'un SEUL rendu (par moteur) serve à la fois l'écran de relecture
// avant sauvegarde ET la carte d'historique — jamais deux implémentations.
//
// Fichier volontairement découplé du type exact renvoyé par le hook React
// Query (qui vit dans /hooks) : zéro import React ici, conformément à
// /docs/architecture.md ("/src/lib/fitness/ → logique pure").
// ============================================================

import type { DisciplineId, WorkoutRecordDraft } from "./types";

export interface PersistedWorkoutRow {
  name: string;
  duration_minutes: number | null;
  notes: string | null;
  gym_location?: string | null;
  discipline?: string | null;
  metadata?: unknown;
  exercises?: Array<{
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    image_path: string | null;
  }> | null;
}

export function adaptWorkoutRow(
  row: PersistedWorkoutRow,
  fallbackDiscipline: DisciplineId = "muscu",
): WorkoutRecordDraft {
  const discipline = (row.discipline as DisciplineId | undefined) ?? fallbackDiscipline;
  return {
    discipline,
    name: row.name,
    duration_minutes: row.duration_minutes ?? 0,
    notes: row.notes ?? undefined,
    gym_location: row.gym_location ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    exerciseRows: row.exercises?.map((e) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      weight: e.weight,
      image_path: e.image_path,
    })),
  };
}
