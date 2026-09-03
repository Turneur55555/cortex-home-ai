import { countPendingAndFailed } from "./syncQueue";
import { listConflicts } from "./syncEngine";
import { isSyncPassRunning, runSyncQueueOnce } from "./syncRuntime";

/**
 * CHANTIER 4 (MAJ-04) — Sécurisation de la déconnexion.
 *
 * Logique PURE (zéro import React, convention `/src/lib/`) qui répond à une
 * seule question avant de laisser `signOut()` s'exécuter (celui-ci purge
 * `syncQueue`/`conflicts` de l'utilisateur, cf. `hooks/use-auth.tsx` +
 * `lib/offline/db.ts` — comportement INCHANGÉ, ce module ne le modifie pas) :
 * reste-t-il, pour cet utilisateur, une opération ou un conflit qu'une
 * déconnexion ferait disparaître silencieusement ?
 *
 * Ce module RÉUTILISE le moteur existant (`runSyncQueueOnce` du runtime
 * partagé, `countPendingAndFailed`/`listConflicts`) — il n'en crée aucun
 * second (cf. garde-fou `components/profile/syncUiPlacement.test.ts`,
 * "aucune seconde boucle de polling").
 */

/** Ce qui constitue une opération/un état « non résolu » au sens de ce chantier. */
export interface OfflineSignOutSummary {
  /** `pending` + `syncing` (cf. `countPendingAndFailed`) — pas encore confirmées par le serveur. */
  pendingCount: number;
  /** Échec transitoire, retenté automatiquement — mais pas encore résolu. */
  failedCount: number;
  /** Échec définitif, n'avancera plus sans action explicite de l'utilisateur. */
  blockedCount: number;
  /** Conflits détectés, en attente d'arbitrage utilisateur. */
  conflictCount: number;
}

const EMPTY_SUMMARY: OfflineSignOutSummary = {
  pendingCount: 0,
  failedCount: 0,
  blockedCount: 0,
  conflictCount: 0,
};

/**
 * Un conflit archivé (`resolution` renseignée) n'est PAS un conflit en
 * attente : `listConflicts` ne renvoie de toute façon que les conflits
 * persistés en base (`resolveConflict` supprime l'enregistrement dès qu'il
 * est arbitré, cf. `syncEngine.ts`), donc tout ce qu'elle renvoie ici compte.
 */
export async function getOfflineSignOutSummary(userId: string): Promise<OfflineSignOutSummary> {
  const [counts, conflicts] = await Promise.all([
    countPendingAndFailed(userId),
    listConflicts(userId),
  ]);
  return {
    pendingCount: counts.pending,
    failedCount: counts.failed,
    blockedCount: counts.blocked,
    conflictCount: conflicts.length,
  };
}

/** Rien à perdre : aucune opération vivante, aucun conflit en attente. */
export function hasUnresolvedOfflineWork(summary: OfflineSignOutSummary): boolean {
  return (
    summary.pendingCount > 0 ||
    summary.failedCount > 0 ||
    summary.blockedCount > 0 ||
    summary.conflictCount > 0
  );
}

/**
 * Attend qu'une VRAIE passe de synchronisation se termine avant de relire
 * l'état. `runSyncQueueOnce` renvoie `null` si une passe est déjà en vol
 * (verrou de passe unique du runtime, cf. `syncRuntime.ts`) : dans ce cas on
 * patiente puis on redemande nous-mêmes une passe, plutôt que de se fier à un
 * résultat qui n'est pas le nôtre.
 */
async function ensureFreshSyncPass(userId: string, maxAttempts = 10): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await runSyncQueueOnce(userId);
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  // Dernier recours : au moins attendre que la passe en cours (pas la nôtre)
  // se termine, pour que la relecture qui suit ne soit pas en pleine course.
  while (isSyncPassRunning()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/**
 * « Synchroniser d'abord » (section 2 du chantier). Réutilise le moteur
 * existant pour tenter de résorber la file, puis relit l'état RÉEL en base —
 * jamais un état React potentiellement pas encore re-rendu. Un conflit ou une
 * opération `blocked` ne peut structurellement pas disparaître d'une simple
 * passe de synchronisation (ils attendent une décision utilisateur) : ils
 * reviendront dans le résumé si présents avant l'appel.
 */
export async function attemptSyncBeforeSignOut(userId: string): Promise<OfflineSignOutSummary> {
  await ensureFreshSyncPass(userId);
  return getOfflineSignOutSummary(userId);
}

export function emptyOfflineSignOutSummary(): OfflineSignOutSummary {
  return { ...EMPTY_SUMMARY };
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count > 1 ? pluralForm : singular;
}

/**
 * Résumé lisible, vocabulaire utilisateur — jamais de nom technique
 * (`updated_at_mismatch`, `server_row_deleted`, nom de table/colonne, cf.
 * section 5 du chantier). Ordre : ce qui demande un arbitrage d'abord
 * (conflits, bloquées), puis ce qui progresse tout seul.
 */
export function describeUnresolvedOfflineWork(summary: OfflineSignOutSummary): string[] {
  const lines: string[] = [];
  if (summary.conflictCount > 0) {
    lines.push(
      `${summary.conflictCount} ${plural(summary.conflictCount, "conflit à résoudre", "conflits à résoudre")}`,
    );
  }
  if (summary.blockedCount > 0) {
    lines.push(
      `${summary.blockedCount} ${plural(summary.blockedCount, "action bloquée", "actions bloquées")}`,
    );
  }
  if (summary.failedCount > 0) {
    lines.push(
      `${summary.failedCount} ${plural(summary.failedCount, "action en échec temporaire", "actions en échec temporaire")}`,
    );
  }
  if (summary.pendingCount > 0) {
    lines.push(
      `${summary.pendingCount} ${plural(summary.pendingCount, "action en attente d'envoi", "actions en attente d'envoi")}`,
    );
  }
  return lines;
}
