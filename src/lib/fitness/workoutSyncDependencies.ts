import type { SyncDependencyRef } from "@/lib/offline/types";
import { isOptimisticId } from "@/lib/offline/pendingOptimisticId";

// ============================================================
// CHANTIER 1 BIS (DISC-01b) — quelles écritures le serveur doit-il avoir
// reçues AVANT d'observer la clôture d'une séance ?
//
// Logique PURE (zéro React, zéro Supabase, zéro IndexedDB), conformément à
// /src/lib : on lui passe des lignes, elle renvoie des références.
//
// POURQUOI ICI ET PAS DANS LE MOTEUR DE FILE : la clôture
// (`workouts.status='completed'`) déclenche `award_xp_on_workout_complete`,
// qui PARCOURT les exercices et les séries de la séance. Le moteur de
// synchronisation, lui, est générique et ne doit connaître aucun modèle
// métier — c'est le domaine Fitness qui sait ce qu'est « un enfant de
// séance ». Le moteur reçoit une simple liste d'enregistrements à attendre
// (`SyncOperation.dependsOnRecords`), sans jamais interpréter les tables.
//
// Le schéma impose d'ailleurs cette séparation : `exercise_sets` ne porte
// AUCUN `workout_id` — seulement `exercise_id`. Rattacher une série à sa
// séance demande une jointure :
//     exercise_set.exercise_id → exercises.id → exercises.workout_id
// Une déduction côté moteur devrait coder cette règle en dur, par table.
// ============================================================

/** Formes minimales attendues — volontairement structurelles, pour que ce
 *  module ne dépende d'aucun type de hook. */
export interface WorkoutChildRows {
  exercises: ReadonlyArray<{ id: string; workout_id: string }>;
  exerciseSets: ReadonlyArray<{ id: string; exercise_id: string }>;
  workoutSegments: ReadonlyArray<{ id: string; workout_id: string }>;
}

/**
 * Enfants d'une séance, dans l'ordre `exercises` → `exercise_sets` →
 * `workout_segments` (sans importance pour le moteur, qui compare des
 * ensembles — l'ordre stable sert seulement à rendre les tests lisibles).
 *
 * GARANTIES
 * ---------
 * 1. **Aucun id optimiste.** Un id `tmp-*` (`useAddExerciseSet` en assigne un
 *    avant que la création réelle ne soit résolue) ne correspond à aucune
 *    opération de la file : le déclarer comme dépendance produirait une
 *    barrière qui ne retient RIEN — DISC-01b silencieusement réintroduit.
 *    Ce filtre est un second rempart : l'appelant doit de toute façon fournir
 *    les lignes du STORE LOCAL, qui ne contient que des ids réels.
 * 2. **Aucune fuite entre séances.** Seuls les enfants de `workoutId` sont
 *    retenus ; les séries sont rattachées via leurs exercices, jamais
 *    directement.
 * 3. **Une séance sans enfant ne produit aucune dépendance** — la clôture
 *    part alors immédiatement, sans barrière.
 */
export function collectWorkoutSyncDependencies(
  workoutId: string,
  rows: WorkoutChildRows,
): SyncDependencyRef[] {
  const exercises = rows.exercises.filter(
    (ex) => ex.workout_id === workoutId && !isOptimisticId(ex.id),
  );
  const exerciseIds = new Set(exercises.map((ex) => ex.id));

  const refs: SyncDependencyRef[] = exercises.map((ex) => ({
    table: "exercises",
    recordLocalId: ex.id,
  }));

  for (const set of rows.exerciseSets) {
    // Jointure explicite : une série appartient à la séance UNIQUEMENT via
    // son exercice (elle ne porte pas de `workout_id`).
    if (!exerciseIds.has(set.exercise_id) || isOptimisticId(set.id)) continue;
    refs.push({ table: "exercise_sets", recordLocalId: set.id });
  }

  for (const segment of rows.workoutSegments) {
    if (segment.workout_id !== workoutId || isOptimisticId(segment.id)) continue;
    refs.push({ table: "workout_segments", recordLocalId: segment.id });
  }

  return refs;
}
