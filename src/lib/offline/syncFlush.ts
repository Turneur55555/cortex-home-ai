import { getIsOnline } from "./networkStatus";
import { processSyncQueue } from "./syncEngine";

/**
 * CHANTIER 4 (CRIT-03) — demande un passage IMMÉDIAT de la sync queue.
 *
 * POURQUOI
 * --------
 * La clôture d'une séance est une écriture offline-first : elle est locale,
 * puis poussée par la queue. Or c'est son ARRIVÉE EN BASE qui déclenche le
 * trigger `award_xp_on_workout_complete`, donc la récompense. Sans ce coup de
 * pouce, la clôture attend le prochain balayage automatique de
 * `useOfflineSync` (jusqu'à 4 s) avant même de partir, et l'écran de
 * récompense reste inutilement en attente.
 *
 * Ce n'est PAS un délai qui masque une course : on ne fait pas patienter
 * l'écran, on déclenche plus tôt le travail réel dont il attend le résultat.
 * L'écran, lui, n'affiche jamais de valeur non confirmée (cf.
 * `lib/fitness/rpg/rewardConfirmation.ts`), que ce passage réussisse ou non.
 *
 * CONTRAT (chantier 1 respecté)
 * -----------------------------
 * Aucun mécanisme de queue n'est réimplémenté ici : on appelle le moteur
 * existant, explicitement documenté comme sûr à invoquer plusieurs fois, en
 * parallèle comme à la suite (prise de possession atomique par
 * `claimOperation`, ordre FIFO et idempotence inchangés). Volontairement
 * fire-and-forget : la clôture ne doit jamais bloquer l'utilisateur sur un
 * aller-retour réseau, et un échec repart tout seul par le backoff normal.
 */
export function requestSyncFlush(userId: string | null | undefined): void {
  if (!userId || !getIsOnline()) return;
  void processSyncQueue(userId).catch(() => {
    // Échec réseau : l'opération reste en file et repartira avec le backoff
    // normal (chantier 1). Rien à signaler ici — l'écran de récompense
    // affiche déjà un état honnête tant que rien n'est confirmé.
  });
}
