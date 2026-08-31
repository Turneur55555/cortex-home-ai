import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  discardBlockedOperation,
  listConflicts,
  processSyncQueue,
  resolveConflict as resolveConflictEngine,
  retryBlockedOperation,
} from "@/lib/offline/syncEngine";
import { countPendingAndFailed, listAllOperations } from "@/lib/offline/syncQueue";
import type {
  ConflictRecord,
  ConflictResolutionStrategy,
  SyncOperation,
} from "@/lib/offline/types";

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  /** Opérations en échec définitif : elles n'avanceront plus sans action explicite. */
  blockedCount: number;
  /**
   * File complète (FIFO), pour que le panneau de synchronisation affiche
   * l'état RÉEL de chaque action — statut, nombre de tentatives et surtout
   * l'erreur exacte (`lastError`), au lieu d'un compteur anonyme.
   */
  operations: SyncOperation[];
  conflicts: ConflictRecord[];
  /** Force une tentative de synchronisation immédiate (bouton "Réessayer"). */
  syncNow: () => Promise<void>;
  resolveConflict: (conflictId: string, strategy: ConflictResolutionStrategy) => Promise<void>;
  /** Remet une opération bloquée en file (action utilisateur explicite). */
  retryOperation: (operationId: string) => Promise<void>;
  /** Retire de la file une opération bloquée — la donnée locale est conservée. */
  discardOperation: (operationId: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 4_000;

/**
 * Hook central de l'indicateur de sync — regroupe statut réseau, compteurs
 * de la queue et conflits en attente pour piloter `SyncStatusIndicator`,
 * le panneau des opérations en attente et l'UI de résolution de conflit.
 * Déclenche automatiquement une synchronisation au retour réseau.
 */
export function useOfflineSync(): OfflineSyncState {
  const { user } = useAuth();
  const isOnline = useNetworkStatus();
  const userId = user?.id ?? null;

  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [operations, setOperations] = useState<SyncOperation[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const syncingRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      setFailedCount(0);
      setBlockedCount(0);
      setOperations([]);
      setConflicts([]);
      return;
    }
    const [counts, conflictList, ops] = await Promise.all([
      countPendingAndFailed(userId),
      listConflicts(userId),
      listAllOperations(userId),
    ]);
    setPendingCount(counts.pending);
    setFailedCount(counts.failed);
    setBlockedCount(counts.blocked);
    setConflicts(conflictList);
    setOperations(ops);
  }, [userId]);

  const attemptSync = useCallback(
    async (options: { respectBackoff?: boolean } = {}) => {
      if (!userId || !isOnline || syncingRef.current) return;
      syncingRef.current = true;
      setIsSyncing(true);
      try {
        await processSyncQueue(userId, options);
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        await refreshCounts();
      }
    },
    [userId, isOnline, refreshCounts],
  );

  // Bouton "Réessayer" / retour réseau explicite : retente immédiatement,
  // sans respecter le backoff (l'utilisateur ou l'événement online vient
  // de donner un signal explicite qu'il faut réessayer maintenant).
  const syncNow = useCallback(() => attemptSync(), [attemptSync]);

  // Poll léger des compteurs — IndexedDB n'a pas d'events de changement
  // pratiques inter-onglet ; un intervalle discret suffit pour un indicateur
  // "sobre", pas temps réel critique. Il sert AUSSI de filet de sécurité
  // pour la sync automatique : `navigator.onLine`/les events `online` sont
  // best-effort (une erreur réseau temporaire, ex. un blip 4G, ne fait
  // jamais transiter `isOnline` par `false` — rien d'autre ne redéclenche
  // alors `syncNow`, cf. l'effet "retour réseau" ci-dessous, ce qui laissait
  // une opération `failed` bloquée jusqu'au bouton "Réessayer" manuel). Ce
  // balayage réutilise l'intervalle déjà existant (pas de nouveau timer) et
  // respecte le backoff exponentiel (`respectBackoff: true`, déjà prévu par
  // `processSyncQueue` mais jamais appelé automatiquement) pour ne pas
  // marteler le réseau après plusieurs échecs. `syncingRef` (partagé avec
  // `syncNow`) garantit qu'un seul passage tourne à la fois.
  useEffect(() => {
    refreshCounts();
    const interval = setInterval(() => {
      refreshCounts();
      void attemptSync({ respectBackoff: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCounts, attemptSync]);

  // Retour réseau → on relance la queue automatiquement.
  useEffect(() => {
    if (isOnline && userId) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, userId]);

  const resolveConflict = useCallback(
    async (conflictId: string, strategy: ConflictResolutionStrategy) => {
      await resolveConflictEngine(conflictId, strategy);
      await refreshCounts();
      if (isOnline) await syncNow();
    },
    [refreshCounts, isOnline, syncNow],
  );

  // Actions explicites sur une opération bloquée (panneau de
  // synchronisation) : « Réessayer quand même » la remet en file et relance
  // la queue, « Retirer de la file » ne touche jamais à la donnée locale
  // (cf. `discardBlockedOperation`).
  const retryOperation = useCallback(
    async (operationId: string) => {
      await retryBlockedOperation(operationId);
      await refreshCounts();
      if (isOnline) await syncNow();
    },
    [refreshCounts, isOnline, syncNow],
  );

  const discardOperation = useCallback(
    async (operationId: string) => {
      await discardBlockedOperation(operationId);
      await refreshCounts();
    },
    [refreshCounts],
  );

  return {
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    blockedCount,
    operations,
    conflicts,
    syncNow,
    resolveConflict,
    retryOperation,
    discardOperation,
  };
}
