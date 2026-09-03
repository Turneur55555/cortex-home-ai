import { listConflicts, processSyncQueue, type SyncResult } from "./syncEngine";
import { countPendingAndFailed, listAllOperations } from "./syncQueue";
import type { ConflictRecord, SyncOperation } from "./types";

/**
 * ÉTAT PARTAGÉ DU MOTEUR OFFLINE (chantier « fiabilisation », CRIT-01).
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Avant : toute la mécanique du moteur (poll, retour réseau, appel à
 * `processSyncQueue`) vivait dans `useOfflineSync`, hook consommé par le SEUL
 * bloc « Synchronisation » du Profil. Conséquence directe : hors de l'écran
 * Profil — c'est-à-dire pendant 99 % de l'usage réel — plus AUCUN passage de
 * la queue n'était déclenché. Une action faite hors ligne pendant une séance
 * n'était poussée que lorsque l'utilisateur ouvrait ses paramètres.
 *
 * Depuis : un driver non visuel (`components/OfflineSyncDriver.tsx`) est monté
 * une seule fois au niveau de l'espace authentifié et porte les effets ; ce
 * module tient l'état PARTAGÉ entre ce driver et les lecteurs d'UI, pour que :
 * - il n'existe qu'UNE SEULE passe de queue en vol à la fois, quel que soit
 *   le nombre de composants montés (verrou `runningPass` ci-dessous, qui
 *   remplace le `syncingRef` local au hook — un ref par instance n'aurait
 *   protégé de rien face à plusieurs consommateurs) ;
 * - l'UI (`SyncStatusCard`, `SyncQueueSheet`) redevienne purement lectrice :
 *   elle s'abonne à cet état, elle ne le produit pas.
 *
 * Zéro import React ici (convention `/src/lib/`) : c'est un petit store
 * observable branché côté React par `useSyncExternalStore`.
 */

export interface SyncRuntimeSnapshot {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  blockedCount: number;
  /** File complète (FIFO) telle que persistée — le panneau affiche l'état RÉEL. */
  operations: SyncOperation[];
  conflicts: ConflictRecord[];
}

const EMPTY_SNAPSHOT: SyncRuntimeSnapshot = {
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  blockedCount: 0,
  operations: [],
  conflicts: [],
};

let snapshot: SyncRuntimeSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

/**
 * Verrou de passe UNIQUE. `processSyncQueue` est déjà sûr à appeler en
 * parallèle (prise de possession atomique par `claimOperation`), mais rien ne
 * justifie de lancer deux passes concurrentes depuis le même onglet : ça ne
 * ferait que doubler les lectures IndexedDB et brouiller `isSyncing`.
 */
let runningPass: Promise<SyncResult> | null = null;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Signature des champs RÉELLEMENT lus par l'UI. Les objets viennent
 * d'IndexedDB : ils sont recréés à chaque lecture, donc jamais identiques par
 * référence. Sans cette comparaison, chaque tick de poll (4 s) provoquerait un
 * rendu inutile de tout ce qui lit le store.
 */
function operationSignature(op: SyncOperation): string {
  return [
    op.id,
    op.status,
    op.opType,
    op.table,
    op.retryCount,
    op.lastError ?? "",
    op.lastErrorCode ?? "",
    op.lastAttemptAt ?? "",
  ].join("|");
}

function conflictSignature(conflict: ConflictRecord): string {
  return [
    conflict.id,
    conflict.reason ?? "",
    conflict.opType ?? "",
    conflict.table,
    conflict.resolution ?? "",
  ].join("|");
}

function isSameSnapshot(a: SyncRuntimeSnapshot, b: SyncRuntimeSnapshot): boolean {
  if (
    a.isSyncing !== b.isSyncing ||
    a.pendingCount !== b.pendingCount ||
    a.failedCount !== b.failedCount ||
    a.blockedCount !== b.blockedCount ||
    a.operations.length !== b.operations.length ||
    a.conflicts.length !== b.conflicts.length
  ) {
    return false;
  }
  return (
    a.operations.every((op, i) => operationSignature(op) === operationSignature(b.operations[i])) &&
    a.conflicts.every((c, i) => conflictSignature(c) === conflictSignature(b.conflicts[i]))
  );
}

function setSnapshot(next: SyncRuntimeSnapshot): void {
  if (isSameSnapshot(snapshot, next)) return;
  snapshot = next;
  emit();
}

export function subscribeSyncRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncRuntimeSnapshot(): SyncRuntimeSnapshot {
  return snapshot;
}

/** Snapshot stable pour le rendu serveur (aucune lecture IndexedDB possible). */
export function getSyncRuntimeServerSnapshot(): SyncRuntimeSnapshot {
  return EMPTY_SNAPSHOT;
}

/**
 * Relit la file et les conflits persistés. IndexedDB n'émet aucun événement
 * de changement exploitable : c'est le driver qui appelle ceci (poll + après
 * chaque action), jamais l'UI de son côté.
 */
export async function refreshSyncRuntime(userId: string | null): Promise<void> {
  if (!userId) {
    setSnapshot({ ...EMPTY_SNAPSHOT, isSyncing: snapshot.isSyncing });
    return;
  }
  const [counts, conflicts, operations] = await Promise.all([
    countPendingAndFailed(userId),
    listConflicts(userId),
    listAllOperations(userId),
  ]);
  setSnapshot({
    isSyncing: snapshot.isSyncing,
    pendingCount: counts.pending,
    failedCount: counts.failed,
    blockedCount: counts.blocked,
    operations,
    conflicts,
  });
}

/**
 * Lance UNE passe de la queue. Si une passe est déjà en vol, on renvoie
 * `null` sans en démarrer une seconde (le déclencheur — poll, retour réseau,
 * bouton « Réessayer » — n'a rien à faire de plus : la passe en cours traite
 * déjà la file, ordre FIFO compris).
 */
export async function runSyncQueueOnce(
  userId: string,
  options: { respectBackoff?: boolean } = {},
): Promise<SyncResult | null> {
  if (runningPass) return null;
  setSnapshot({ ...snapshot, isSyncing: true });
  const pass = processSyncQueue(userId, options);
  runningPass = pass;
  try {
    return await pass;
  } finally {
    runningPass = null;
    setSnapshot({ ...snapshot, isSyncing: false });
    await refreshSyncRuntime(userId);
  }
}

/** Une passe est-elle en vol ? (diagnostic / tests) */
export function isSyncPassRunning(): boolean {
  return runningPass !== null;
}

/** Remise à zéro complète — tests uniquement. */
export function resetSyncRuntimeForTests(): void {
  snapshot = EMPTY_SNAPSHOT;
  listeners.clear();
  runningPass = null;
}
