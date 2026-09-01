// ============================================================
// CHANTIER 4 — CRIT-03 : honnêteté de la récompense de fin de séance.
// Logique PURE (zéro React, zéro Supabase), conformément à /src/lib.
//
// Le montant d'XP d'une séance est décidé par le SERVEUR (trigger
// `award_xp_on_workout_complete`), déclenché quand `workouts.status` passe à
// 'completed' EN BASE. Or l'écriture de clôture est offline-first : elle est
// d'abord locale, puis poussée par la sync queue. Entre les deux, AUCUNE
// valeur d'XP serveur n'existe pour cette séance.
//
// Ce module ne décide donc que d'une chose : a-t-on le droit d'AFFICHER une
// récompense comme confirmée ? Il ne calcule aucun montant, ne dérive aucun
// rang et ne modifie aucune règle RPG.
// ============================================================

/**
 * Compteurs autoritatifs déposés par le serveur sur la séance elle-même
 * (`workouts.xp_before/xp_after/level_before/level_after`, migration
 * `20260718120000`). Les quatre colonnes vont ensemble : le trigger les écrit
 * dans un seul UPDATE, donc une seule non nulle signalerait une ligne
 * incohérente — on n'en tire alors aucune conclusion.
 */
export interface RewardServerSnapshot {
  xp_before: number | null;
  xp_after: number | null;
  level_before: number | null;
  level_after: number | null;
}

/**
 * - `confirmed` : le serveur a versé l'XP et déposé ses compteurs sur la
 *   séance. C'est le SEUL état où un montant d'XP peut être affiché.
 * - `syncing` : la clôture n'a pas encore atteint le serveur (hors ligne, ou
 *   opération encore en file). Rien n'a pu être calculé — état honnête
 *   « en attente de synchronisation ».
 * - `awaiting-server` : la clôture est partie, la récompense n'a pas encore
 *   été relue. Attente courte et normale, pas une erreur.
 */
export type RewardConfirmation = "confirmed" | "syncing" | "awaiting-server";

export interface RewardConfirmationInput {
  /** Instantané serveur relu sur la séance (null tant qu'aucune lecture n'a abouti). */
  snapshot: RewardServerSnapshot | null | undefined;
  /** Une opération de synchronisation subsiste-t-elle pour cette séance ? */
  hasQueuedWorkoutOps: boolean;
  /** Statut réseau au moment du rendu. */
  isOnline: boolean;
}

/** Le serveur a-t-il réellement déposé ses quatre compteurs sur la séance ? */
export function hasServerRewardSnapshot(
  snapshot: RewardServerSnapshot | null | undefined,
): boolean {
  return (
    snapshot != null &&
    snapshot.xp_before != null &&
    snapshot.xp_after != null &&
    snapshot.level_before != null &&
    snapshot.level_after != null
  );
}

/**
 * État d'affichage de la récompense.
 *
 * Ordre volontaire : la présence de l'instantané serveur PRIME sur tout le
 * reste. Une séance dont la récompense est déjà calculée reste confirmée même
 * si l'appareil repasse hors ligne juste après, ou si une autre opération
 * (résumé d'exercices, segment…) traîne encore dans la file : la valeur
 * affichée, elle, vient bien du serveur.
 */
export function resolveRewardConfirmation({
  snapshot,
  hasQueuedWorkoutOps,
  isOnline,
}: RewardConfirmationInput): RewardConfirmation {
  if (hasServerRewardSnapshot(snapshot)) return "confirmed";
  if (!isOnline || hasQueuedWorkoutOps) return "syncing";
  return "awaiting-server";
}
