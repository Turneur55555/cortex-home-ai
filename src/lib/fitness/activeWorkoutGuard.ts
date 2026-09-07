// Étape 0.1 (refonte Séances — Phase 0, fiabilisation INV-1) — implémentation
// unique de la traduction du conflit "séance active en double" en message
// utilisateur propre. Backstop de l'index unique partiel
// `workouts_one_active_per_user` (voir
// supabase/migrations/20260714150000_workouts_one_active_per_user.sql) : les
// 5 points de démarrage de séance font tous une garde locale
// (`assertNoActiveWorkout`, use-fitness.ts) — mais une course entre onglets
// ou entre appareils peut toujours passer entre le check et l'insert. Sans
// ce mapping, l'usager verrait l'erreur Postgres brute (23505, nom de
// contrainte) au lieu d'un message clair.
//
// AUD-06 (chantier final) — la course DANS UN MÊME CONTEXTE, elle, est
// désormais fermée en amont : garde et création forment une section critique
// sérialisée par utilisateur (`lib/fitness/activeWorkoutStart.ts`). Ce
// backstop reste indispensable pour la course que rien de local ne peut
// couvrir (deux onglets, deux appareils).
//
// Consommateurs (5) : use-fitness.ts (useStartWorkout,
// useStartHybridStrengthWorkout, useStartWorkoutFromTemplate),
// useWorkoutTemplates.ts (useStartWorkoutFromSavedTemplate),
// useGenericActiveSession.ts (useStartGenericActiveWorkout).

export const ACTIVE_WORKOUT_CONFLICT_MESSAGE = "Une séance est déjà en cours.";

export interface PostgrestErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/**
 * Vrai si l'erreur correspond à une violation de l'index unique
 * `workouts_one_active_per_user` (contrainte 23505 ciblée par nom, pas
 * n'importe quel conflit d'unicité).
 */
export function isActiveWorkoutConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as PostgrestErrorLike;
  if (e.code !== "23505") return false;
  const haystack = `${e.message ?? ""} ${e.details ?? ""}`;
  return haystack.includes("workouts_one_active_per_user");
}
