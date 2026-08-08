import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  listConflicts,
  processSyncQueue,
  resolveConflict as resolveConflictEngine,
} from "@/lib/offline/syncEngine";
import { countPendingAndFailed } from "@/lib/offline/syncQueue";
import type { ConflictRecord, ConflictResolutionStrategy } from "@/lib/offline/types";

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  conflicts: ConflictRecord[];
  /** Force une tentative de synchronisation immédiate (bouton "Réessayer"). */
  syncNow: () => Promise<void>;
  resolveConflict: (conflictId: string, strategy: ConflictResolutionStrategy) => Promise<void>;
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
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const syncingRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      setFailedCount(0);
      setConflicts([]);
      return;
    }
    const [counts, conflictList] = await Promise.all([
      countPendingAndFailed(userId),
      listConflicts(userId),
    ]);
    setPendingCount(counts.pending);
    setFailedCount(counts.failed);
    setConflicts(conflictList);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || !isOnline || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await processSyncQueue(userId);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshCounts();
    }
  }, [userId, isOnline, refreshCounts]);

  // Poll léger des compteurs — IndexedDB n'a pas d'events de changement
  // pratiques inter-onglet ; un intervalle discret suffit pour un indicateur
  // "sobre", pas temps réel critique.
  useEffect(() => {
    refreshCounts();
    const interval = setInterval(refreshCounts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCounts]);

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

  return { isOnline, isSyncing, pendingCount, failedCount, conflicts, syncNow, resolveConflict };
}
