import { useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  getSyncRuntimeServerSnapshot,
  getSyncRuntimeSnapshot,
  subscribeSyncRuntime,
} from "@/lib/offline/syncRuntime";

/**
 * CHANTIER 4 (AMEL-04) — visibilité des conflits en dehors de Profil.
 *
 * Volontairement DISTINCT de `useOfflineSync` (réservé au seul bloc
 * Synchronisation du Profil, cf. `components/profile/syncUiPlacement.test.ts`) :
 * ce hook n'expose RIEN d'autre que le nombre de conflits, pour un usage
 * global sobre (un point discret, jamais un indicateur de synchronisation
 * complet). Il lit le même store partagé que le driver
 * (`lib/offline/syncRuntime.ts`) — aucun second mécanisme de lecture, aucune
 * nouvelle boucle de poll.
 */
export function useConflictIndicator(): number {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(
    subscribeSyncRuntime,
    getSyncRuntimeSnapshot,
    getSyncRuntimeServerSnapshot,
  );
  return user ? snapshot.conflicts.length : 0;
}
