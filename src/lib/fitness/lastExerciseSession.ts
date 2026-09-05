/**
 * CHANTIER 9 (E1) — « DERNIÈRE SÉANCE » D'UN EXERCICE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB), conformément à
 * `/src/lib` : on lui passe des lignes, elle renvoie la dernière séance
 * exploitable de chaque exercice. Le hook (`hooks/useLastExerciseSession.ts`)
 * ne fait plus que fournir ces lignes.
 *
 * LA RÈGLE, INCHANGÉE
 * -------------------
 * Pour chaque exercice demandé (identifié par `identityKey` :
 * `exercise_reference_id` en priorité, nom normalisé en filet) :
 * - on ne regarde QUE les séances TERMINÉES, en excluant la séance en cours ;
 * - on ne retient QUE les séries VALIDÉES (H3 — une série saisie mais non
 *   cochée n'a pas été réalisée, elle ne peut pas servir de référence) ;
 * - on prend la séance la plus RÉCENTE qui porte au moins une série
 *   renseignée (reps OU charge), et on renvoie ses séries triées par numéro.
 */

import { identityKey } from "./recentExercises";

export interface LastSessionSet {
  set_number: number;
  reps: number | null;
  weight: number | null;
}

export interface LastSession {
  workoutId: string;
  date: string;
  sets: LastSessionSet[];
}

/** Formes minimales attendues — volontairement structurelles, pour que ce
 *  module ne dépende d'aucun type de hook ni de la base. */
export interface LastSessionSourceRows {
  workouts: ReadonlyArray<{ id: string; date: string | null; status: string | null }>;
  exercises: ReadonlyArray<{
    id: string;
    workout_id: string | null;
    name: string;
    exercise_reference_id: string | null;
  }>;
  exerciseSets: ReadonlyArray<{
    exercise_id: string;
    set_number: number;
    reps: number | null;
    weight: number | null;
    completed: boolean;
  }>;
}

export function selectLastExerciseSessions(params: {
  /** Identités recherchées (`identityKey`). */
  keys: ReadonlySet<string>;
  /** Séance en cours — jamais sa propre référence. */
  excludeWorkoutId: string | null | undefined;
  rows: LastSessionSourceRows;
}): Map<string, LastSession> {
  const { keys, excludeWorkoutId, rows } = params;
  const result = new Map<string, LastSession>();
  if (keys.size === 0) return result;

  // Séances TERMINÉES uniquement, datées, hors séance en cours. Le statut est
  // filtré explicitement plutôt que déduit de la seule exclusion : le store
  // local contient aussi la séance active, et une séance non terminée n'est
  // pas une référence de progression.
  const dateByWorkout = new Map<string, string>();
  for (const workout of rows.workouts) {
    if (workout.status !== "completed") continue;
    if (excludeWorkoutId && workout.id === excludeWorkoutId) continue;
    if (!workout.date) continue;
    dateByWorkout.set(workout.id, workout.date);
  }
  if (dateByWorkout.size === 0) return result;

  const exerciseById = new Map<string, { key: string; workoutId: string }>();
  for (const exercise of rows.exercises) {
    if (!exercise.workout_id || !dateByWorkout.has(exercise.workout_id)) continue;
    const key = identityKey({
      name: exercise.name,
      exercise_reference_id: exercise.exercise_reference_id,
    });
    if (!keys.has(key)) continue;
    exerciseById.set(exercise.id, { key, workoutId: exercise.workout_id });
  }
  if (exerciseById.size === 0) return result;

  // H3 : seules les séries validées servent de référence.
  const byKeyWorkout = new Map<string, Map<string, LastSessionSet[]>>();
  for (const set of rows.exerciseSets) {
    if (!set.completed) continue;
    const owner = exerciseById.get(set.exercise_id);
    if (!owner) continue;
    let workoutsForKey = byKeyWorkout.get(owner.key);
    if (!workoutsForKey) {
      workoutsForKey = new Map();
      byKeyWorkout.set(owner.key, workoutsForKey);
    }
    const list = workoutsForKey.get(owner.workoutId);
    const row = { set_number: set.set_number, reps: set.reps, weight: set.weight };
    if (list) list.push(row);
    else workoutsForKey.set(owner.workoutId, [row]);
  }

  for (const [key, workoutsForKey] of byKeyWorkout) {
    const ordered = Array.from(workoutsForKey.entries())
      .map(([workoutId, sets]) => ({
        workoutId,
        date: dateByWorkout.get(workoutId) as string,
        sets,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const { workoutId, date, sets } of ordered) {
      const filled = sets
        .filter((s) => s.reps != null || s.weight != null)
        .sort((a, b) => a.set_number - b.set_number);
      if (filled.length === 0) continue;
      result.set(key, { workoutId, date, sets: filled });
      break;
    }
  }

  return result;
}
