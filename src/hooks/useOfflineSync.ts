import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { isOfflineFirstQuery } from "@/lib/offline/offlineQuery";
import { isServerConfirmedQuery } from "@/lib/offline/serverConfirmedQuery";
import { markWorkoutsServerRefreshStale } from "@/lib/offline/workoutsRefreshWindow";
import {
  discardBlockedOperation,
  resolveConflict as resolveConflictEngine,
  retryBlockedOperation,
} from "@/lib/offline/syncEngine";
import {
  getSyncRuntimeServerSnapshot,
  getSyncRuntimeSnapshot,
  refreshSyncRuntime,
  runSyncQueueOnce,
  subscribeSyncRuntime,
} from "@/lib/offline/syncRuntime";
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
 * Cœur partagé : identité de l'utilisateur, état réseau et déclenchement
 * d'une passe de queue avec l'invalidation ciblée qui suit. Utilisé par le
 * DRIVER (effets permanents) comme par les ACTIONS de l'UI — une seule
 * implémentation, donc aucun risque que les deux divergent.
 */
function useSyncRunner() {
  const { user } = useAuth();
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const attemptSync = useCallback(
    async (options: { respectBackoff?: boolean } = {}) => {
      if (!userId || !isOnline) return;
      // `runSyncQueueOnce` porte le verrou de passe unique (cf.
      // `lib/offline/syncRuntime.ts`) : un second déclencheur pendant qu'une
      // passe tourne ne fait rien, il ne lance jamais une boucle concurrente.
      const result = await runSyncQueueOnce(userId, options);
      if (!result) return;
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
    },
    [userId, isOnline, queryClient],
  );

  const refresh = useCallback(() => refreshSyncRuntime(userId), [userId]);

  return { userId, isOnline, attemptSync, refresh };
}

/**
 * Garde-fou anti-double driver. Deux instances monteraient DEUX boucles de
 * poll : le verrou de passe unique empêcherait la double synchronisation,
 * mais pas le gaspillage ni la confusion de diagnostic. En dev, on le dit
 * fort ; en prod le verrou suffit à préserver le comportement.
 */
let mountedDrivers = 0;

/**
 * DRIVER DU MOTEUR OFFLINE — à monter UNE SEULE FOIS, au niveau de l'espace
 * authentifié (`components/OfflineSyncDriver.tsx`, monté par
 * `routes/_authenticated.tsx`).
 *
 * Il porte TOUT ce qui doit tourner en permanence, quel que soit l'écran
 * affiché : balayage périodique, reprise au retour réseau, récupération des
 * opérations `syncing` orphelines et retry/backoff (assurés par
 * `processSyncQueue` lui-même), et rafraîchissement de l'état partagé lu par
 * l'UI. AUCUN rendu : ce hook ne renvoie rien et le composant qui le monte
 * renvoie `null`.
 *
 * Avant ce chantier, ces effets vivaient dans `useOfflineSync`, consommé par
 * le seul bloc « Synchronisation » du Profil : hors de cet écran, la queue
 * n'était jamais reprise (CRIT-01).
 */
export function useOfflineSyncDriver(): void {
  const { userId, isOnline, attemptSync, refresh } = useSyncRunner();

  useEffect(() => {
    mountedDrivers += 1;
    if (mountedDrivers > 1 && import.meta.env?.DEV) {
      console.error(
        `[useOfflineSyncDriver] ${mountedDrivers} drivers montés simultanément — un seul composant OfflineSyncDriver doit exister (routes/_authenticated.tsx).`,
      );
    }
    return () => {
      mountedDrivers -= 1;
    };
  }, []);

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
  // `processSyncQueue`) pour ne pas marteler le réseau après plusieurs
  // échecs. Le verrou de passe unique (`syncRuntime`) garantit qu'un seul
  // passage tourne à la fois.
  //
  // OPTIMISATION (chantier 3, phase 8) : le balayage est suspendu quand
  // l'onglet est masqué. Rien n'y est affiché et l'utilisateur ne peut créer
  // aucune opération : il n'y a donc rien à observer. Au retour au premier
  // plan on refait immédiatement un passage complet (compteurs + tentative de
  // sync), donc la convergence n'est jamais retardée — elle est même plus
  // rapide qu'en attendant le prochain tick. Le polling lui-même est
  // CONSERVÉ : il reste le seul mécanisme qui remonte une écriture faite hors
  // ligne (IndexedDB n'émet pas d'événement de changement) et le seul filet
  // de sécurité quand `navigator.onLine` ne bascule jamais (blip 4G).
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const tick = () => {
      void refresh();
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

    void refresh();
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
  }, [refresh, attemptSync]);

  // Retour réseau → on relance la queue automatiquement.
  useEffect(() => {
    if (isOnline && userId) {
      // Le retour du réseau est un des moments où une lecture serveur est
      // réellement utile (l'appareil a pu manquer des écritures faites
      // ailleurs) : on périme la fenêtre de fraîcheur avant de relancer.
      markWorkoutsServerRefreshStale();
      void attemptSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, userId]);
}

/**
 * Hook de LECTURE de l'état de synchronisation (+ actions utilisateur
 * explicites). Il ne porte AUCUN effet nécessaire au fonctionnement du
 * moteur : celui-ci tourne en permanence dans `useOfflineSyncDriver`, monté
 * globalement. Ce hook peut donc être monté, démonté ou jamais monté du tout
 * sans que la synchronisation ne s'arrête — c'est précisément le correctif
 * CRIT-01.
 *
 * Il alimente le bloc « Synchronisation » du Profil (`SyncStatusCard`) et le
 * panneau détaillé (`SyncQueueSheet`) : statut, file complète, conflits, et
 * les actions « Réessayer », « Retirer de la file », résolution de conflit.
 */
export function useOfflineSync(): OfflineSyncState {
  const { userId, isOnline, attemptSync, refresh } = useSyncRunner();
  const runtime = useSyncExternalStore(
    subscribeSyncRuntime,
    getSyncRuntimeSnapshot,
    getSyncRuntimeServerSnapshot,
  );

  // Lecture immédiate à l'ouverture de l'écran : on n'attend pas le prochain
  // tick du driver pour afficher l'état réel de la file.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Bouton "Réessayer" / action explicite : retente immédiatement, sans
  // respecter le backoff (l'utilisateur vient de donner un signal explicite
  // qu'il faut réessayer maintenant).
  const syncNow = useCallback(() => attemptSync(), [attemptSync]);

  const resolveConflict = useCallback(
    async (conflictId: string, strategy: ConflictResolutionStrategy) => {
      await resolveConflictEngine(conflictId, strategy);
      await refresh();
      if (isOnline) await syncNow();
    },
    [refresh, isOnline, syncNow],
  );

  // Actions explicites sur une opération bloquée (panneau de
  // synchronisation) : « Réessayer quand même » la remet en file et relance
  // la queue, « Retirer de la file » ne touche jamais à la donnée locale
  // (cf. `discardBlockedOperation`).
  const retryOperation = useCallback(
    async (operationId: string) => {
      await retryBlockedOperation(operationId);
      await refresh();
      if (isOnline) await syncNow();
    },
    [refresh, isOnline, syncNow],
  );

  const discardOperation = useCallback(
    async (operationId: string) => {
      await discardBlockedOperation(operationId);
      await refresh();
    },
    [refresh],
  );

  return {
    isOnline,
    isSyncing: runtime.isSyncing,
    pendingCount: userId ? runtime.pendingCount : 0,
    failedCount: userId ? runtime.failedCount : 0,
    blockedCount: userId ? runtime.blockedCount : 0,
    operations: userId ? runtime.operations : [],
    conflicts: userId ? runtime.conflicts : [],
    syncNow,
    resolveConflict,
    retryOperation,
    discardOperation,
  };
}
