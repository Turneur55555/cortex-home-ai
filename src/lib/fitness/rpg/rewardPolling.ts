// ============================================================
// CHANTIER FINAL — AUD-12 : cadence de relecture de la récompense de séance.
// Logique PURE (zéro React, zéro Supabase), conformément à /src/lib.
//
// CE QUE CE MODULE NE FAIT PAS
// ----------------------------
// Il ne décide RIEN de la récompense elle-même : la barrière de confirmation
// (`rewardConfirmation.ts`) est inchangée, aucune valeur n'est affichée avant
// que le serveur ne l'ait déposée, et rien n'est jamais présenté comme
// confirmé plus tôt. Ce module ne règle QUE la fréquence à laquelle on
// redemande au serveur « as-tu fini ? ».
//
// LE PROBLÈME
// -----------
// L'écran de récompense relit `workouts.xp_*` toutes les 1,5 s tant que la
// récompense n'est pas confirmée — sans aucune fin. Dans le cas nominal, la
// confirmation arrive en quelques secondes et cette cadence est exactement ce
// qu'il faut. Mais quand la clôture ne peut PAS aboutir — opération bloquée,
// serveur en échec, trigger non déployé — l'écran reste ouvert et interroge
// le serveur 40 fois par minute, indéfiniment, en pure perte de batterie et
// de données mobiles.
//
// LA RÈGLE
// --------
// La cadence s'espace avec le temps d'attente, et NE S'ARRÊTE JAMAIS. C'est
// le point important : arrêter la relecture ferait qu'une récompense
// réellement versée plus tard (retour du réseau, opération débloquée par
// l'utilisateur) ne s'afficherait plus jamais sans quitter puis rouvrir
// l'écran. On ralentit, on n'abandonne pas.
// ============================================================

/** Cadence nominale : la confirmation arrive presque toujours dans ce palier. */
export const REWARD_POLL_FAST_MS = 1_500;
/** Au-delà de ~30 s d'attente : ça ne tient plus à une simple latence. */
export const REWARD_POLL_SLOW_MS = 5_000;
/** Au-delà de ~2 min : quelque chose attend une action (file bloquée, réseau). */
export const REWARD_POLL_IDLE_MS = 20_000;

const SLOW_AFTER_MS = 30_000;
const IDLE_AFTER_MS = 120_000;

/**
 * Intervalle de relecture à appliquer, en fonction du temps écoulé depuis la
 * première tentative. `false` n'est JAMAIS renvoyé ici : l'arrêt est décidé
 * par l'appelant, et uniquement parce que la récompense est confirmée (il n'y
 * a alors plus rien à relire).
 */
export function rewardSnapshotPollIntervalMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < SLOW_AFTER_MS) return REWARD_POLL_FAST_MS;
  if (elapsedMs < IDLE_AFTER_MS) return REWARD_POLL_SLOW_MS;
  return REWARD_POLL_IDLE_MS;
}
