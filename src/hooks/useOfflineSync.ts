import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { isOfflineFirstQuery } from "@/lib/offline/offlineQuery";
import { isServerConfirmedQuery } from "@/lib/offline/serverConfirmedQuery";
import { markWorkoutsServerRefreshStale } from "@/lib/offline/workoutsRefreshWindow";
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
  const queryClient = useQueryClient();
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
        const result = await processSyncQueue(userId, options);
        // RAFRAÎCHISSEMENT CIBLÉ (chantier 3, phase 7) : une opération
        // réellement partie au serveur a fait évoluer le store local
        // (entité repassée en `synced`, valeurs serveur fusionnées, conflit
        // archivé). Seules les queries offline-first lisent ce store : on
        // n'invalide QUE celles-là (marqueur `meta.offlineFirst`, cf.
        // `lib/offline/offlineQuery.ts`), et uniquement celles montées
        // (`refetchType: "active"`). Pas de `invalidateQueries()` global :
        // ça relancerait au retour réseau des dizaines de requêtes
        // online-only sans aucun rapport avec la synchronisation.
        if (result.succeeded > 0 || result.conflicted > 0) {
          // NOTE (chantier 4, MAJ-04) : ce refetch n'a volontairement PAS
          // besoin d'une relecture serveur complète. La réponse de chaque
          // opération a déjà été réappliquée en local
          // (`applyServerRowToEntity`), donc le store IndexedDB porte déjà la
          // version serveur de NOS écritures ; les colonnes calculées par les
          // triggers RPG (`workouts.xp_*`) ne sont lues nulle part depuis ce
          // store, mais par la query dédiée de l'écran de récompense
          // (invalidée juste en dessous). La fenêtre de fraîcheur n'est donc
          // rouverte qu'au retour du réseau (voir plus bas), là où un autre
          // appareil a pu écrire.
          void queryClient.invalidateQueries({
            predicate: isOfflineFirstQuery,
            refetchType: "active",
          });
          // CHANTIER 4 (MAJ-08) : seconde catégorie légitime — les queries
          // dont la valeur est PRODUITE PAR LE SERVEUR à partir de ce qu'on
          // vient de lui pousser (`user_stats`, `rank_promotions`,
          // récompense de séance). Elles ne lisent pas IndexedDB, donc le
          // ciblage `offlineFirst` du chantier 3 ne les couvrait pas : le
          // Niveau/Rang restait figé après la synchronisation d'une séance
          // terminée hors ligne. Toujours pas d'invalidation globale.
          void queryClient.invalidateQueries({
            predicate: isServerConfirmedQuery,
            refetchType: "active",
          });
        }
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        await refreshCounts();
      }
    },
    [userId, isOnline, refreshCounts, queryClient],
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
  //
  // OPTIMISATION (chantier 3, phase 8) : le balayage est suspendu quand
  // l'onglet est masqué. Rien n'y est affiché (les compteurs ne servent qu'à
  // l'indicateur) et l'utilisateur ne peut créer aucune opération : il n'y a
  // donc rien à observer. Au retour au premier plan on refait immédiatement
  // un passage complet (compteurs + tentative de sync), donc la convergence
  // n'est jamais retardée — elle est même plus rapide qu'en attendant le
  // prochain tick. Le polling lui-même est CONSERVÉ : il reste le seul
  // mécanisme qui remonte à l'indicateur une écriture faite hors ligne
  // (IndexedDB n'émet pas d'événement de changement) et le seul filet de
  // sécurité quand `navigator.onLine` ne bascule jamais (blip 4G).
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const tick = () => {
      refreshCounts();
      void attemptSync({ respectBackoff: true });
    };
    const start = () => {
      if (interval) return;
      interval = setInterval(tick, POLL_INTERVAL_MS);
    };
    const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

    const onVisibilityChange = () => {
      if (isHidden()) {
        stop();
        return;
      }
      tick();
      start();
    };

    refreshCounts();
    if (!isHidden()) start();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [refreshCounts, attemptSync]);

  // Retour réseau → on relance la queue automatiquement.
  useEffect(() => {
    if (isOnline && userId) {
      // Le retour du réseau est un des moments où une lecture serveur est
      // réellement utile (l'appareil a pu manquer des écritures faites
      // ailleurs) : on périme la fenêtre de fraîcheur avant de relancer.
      markWorkoutsServerRefreshStale();
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
