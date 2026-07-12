// ============================================================
// Domaine pur — dérive la liste "exercices récents" (dédupliqués,
// dernières valeurs connues) depuis un historique de séances. Extrait
// pour être partagé entre le picker en séance active (ActiveWorkoutView)
// et l'éditeur de modèles de séance (TemplateEditorSheet) — même
// logique, deux points d'entrée, zéro duplication.
//
// Phase 3, Étape 4 — bascule lecture par exercise_id (sous-étape 3/3) :
// même principe que useExerciseSetHistory.ts/useSegmentHistory.ts, mais
// adapté à un dédoublonnage (pas un filtrage pour UNE identité cible).
// Chaque exercice porte désormais, quand disponible, son
// `exerciseReferenceId` (colonne `exercises.exercise_reference_id`,
// déjà sélectionnée par `useWorkouts()` via `exercises(*)`). La clé de
// dédoublonnage devient CET id en priorité — deux occurrences du même
// exercice partageant un id sont fusionnées même si leur libellé brut
// diffère légèrement (accents/casse/renommage). Filet de compatibilité :
// si `exerciseReferenceId` est absent (ligne pré-backfill, ne devrait
// plus arriver après l'Étape 3, mais on ne suppose jamais une couverture
// 100% garantie), repli sur l'ancienne clé `normalize(name)` — aucune
// rupture pour les appelants existants (contrat `RecentExercise`
// inchangé, `name`/`lastSets`/`lastReps`/`lastWeight` identiques).
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
  /** `exercises.exercise_reference_id` — additif, absent des anciens
   *  appelants qui ne le sélectionnent pas explicitement (structurellement
   *  compatible, `useWorkouts()` le fournit déjà via `exercises(*)`). */
  exercise_reference_id?: string | null;
}

export interface WorkoutLike {
  exercises?: ReadonlyArray<WorkoutExerciseLike> | null;
}

/** Clé d'identité d'une occurrence : priorité à `exercise_reference_id`
 *  (source de vérité), repli sur le nom normalisé si absent. */
/**
 * Clé d'identité d'un exercice : priorité à `exercise_reference_id` (identité
 * métier stable, voir ExerciseResolutionService), repli sur le nom normalisé
 * si l'exercice n'a pas encore de référence résolue (filet de compatibilité).
 * Exportée (Étape 4.5) pour être réutilisée par tout hook de lecture ayant
 * besoin de regrouper/faire correspondre des exercices par identité plutôt
 * que par libellé — voir useLastExerciseSession.ts.
 */
export function identityKey(ex: { name: string; exercise_reference_id?: string | null }): string {
  if (ex.exercise_reference_id) return `id:${ex.exercise_reference_id}`;
  return `name:${normalize(ex.name)}`;
}

/** `workouts` doit déjà être trié le plus récent en premier (comme
 *  `useWorkouts()`) — le premier exercice rencontré pour une identité
 *  donnée l'emporte. */
export function computeRecentExercises(
  workouts: ReadonlyArray<WorkoutLike> | undefined,
  limit = 30,
): RecentExercise[] {
  if (!workouts) return [];
  const seen = new Map<string, RecentExercise>();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name.trim()) continue;
      const key = identityKey(ex);
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
