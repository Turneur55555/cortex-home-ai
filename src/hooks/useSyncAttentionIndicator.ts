import { useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  getSyncRuntimeServerSnapshot,
  getSyncRuntimeSnapshot,
  subscribeSyncRuntime,
} from "@/lib/offline/syncRuntime";

/**
 * CHANTIER 4 (AMEL-04), étendu par le CHANTIER FINAL (AUD-05) — visibilité,
 * en dehors de Profil, de ce qui attend une DÉCISION de l'utilisateur.
 *
 * DEUX ÉTATS, UN SEUL SENS
 * ------------------------
 * - un CONFLIT : la même donnée a été modifiée ailleurs, il faut choisir la
 *   version à garder ;
 * - une opération BLOQUÉE : elle a épuisé ses tentatives et n'avancera plus
 *   seule (« Réessayer quand même » ou « Retirer de la file »).
 *
 * Les deux se résolvent au MÊME endroit (Profil → Synchronisation), et
 * `summarizeSyncQueue` les traite déjà à l'identique (`needsAttention`,
 * ton `attention`). Ne signaler que le premier laissait le second totalement
 * invisible hors de Profil — or une opération bloquée sur une séance RETIENT
 * sa clôture (barrière de dépendance du chantier 1 bis) et donc la
 * récompense XP : l'utilisateur voyait une séance qui n'aboutit pas, sans
 * rien à l'écran pour lui dire qu'une action de sa part était attendue.
 *
 * CE QUE CE HOOK NE FAIT PAS
 * --------------------------
 * - il n'expose NI `pendingCount` NI `failedCount` : ces deux états se
 *   résorbent tout seuls, en faire une notification globale ramènerait
 *   l'indicateur permanent retiré par l'audit UI du 01/09/2026 ;
 * - il ne touche à RIEN du moteur : ni à la barrière de dépendance (une
 *   opération `blocked` reste une dépendance vivante), ni à la barrière XP.
 *   Il ne fait que RENDRE VISIBLE un état déjà calculé ;
 * - il n'ouvre aucune seconde boucle de lecture : il s'abonne au même store
 *   partagé que le driver (`lib/offline/syncRuntime.ts`), alimenté par le
 *   poll unique de `useOfflineSyncDriver`.
 *
 * Volontairement DISTINCT de `useOfflineSync` (réservé au seul bloc
 * Synchronisation du Profil, cf. `components/profile/syncUiPlacement.test.ts`) :
 * il n'expose que ce qu'il faut pour un signal sobre, jamais l'état complet.
 */
export interface SyncAttentionIndicator {
  /** Données modifiées ailleurs, en attente d'arbitrage. */
  conflictCount: number;
  /** Opérations en échec définitif : elles n'avanceront plus sans décision. */
  blockedCount: number;
  /** Total — c'est lui qui décide de l'affichage du signal. */
  total: number;
}

const NONE: SyncAttentionIndicator = { conflictCount: 0, blockedCount: 0, total: 0 };

export function useSyncAttentionIndicator(): SyncAttentionIndicator {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(
    subscribeSyncRuntime,
    getSyncRuntimeSnapshot,
    getSyncRuntimeServerSnapshot,
  );
  if (!user) return NONE;

  const conflictCount = snapshot.conflicts.length;
  const blockedCount = snapshot.blockedCount;
  if (conflictCount === 0 && blockedCount === 0) return NONE;
  return { conflictCount, blockedCount, total: conflictCount + blockedCount };
}
