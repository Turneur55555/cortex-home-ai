import { createServerRefreshGate } from "./serverRefreshWindow";

/**
 * CHANTIER 4 — MAJ-04 : instance PARTAGÉE de la fenêtre de fraîcheur du
 * rafraîchissement serveur du domaine séances (`refreshWorkoutsFromServer`,
 * cf. `hooks/use-fitness.ts`).
 *
 * Vit dans un module dédié — et pas dans `use-fitness.ts` — pour que
 * `useOfflineSync` puisse rouvrir la fenêtre au retour du réseau sans importer
 * tout le domaine fitness (et sans créer de cycle d'imports).
 */

/**
 * Durée pendant laquelle une relecture serveur des séances est considérée
 * inutile.
 *
 * Choix du seuil (60 s), à partir du fonctionnement réel de l'app :
 * - nettement AU-DESSUS du rythme des invalidations d'une séance active (une
 *   par série validée, souvent plusieurs par minute) : c'est précisément la
 *   cascade que ce garde-fou supprime ;
 * - les moments où une lecture serveur apporte réellement quelque chose ne
 *   dépendent PAS de ce délai : premier montage (fenêtre vide), retour du
 *   réseau et changement d'utilisateur rouvrent la fenêtre explicitement via
 *   `markWorkoutsServerRefreshStale()` ;
 * - le seul cas non couvert est une écriture faite sur un AUTRE appareil
 *   pendant que celui-ci reste connecté et actif : elle apparaît au plus tard
 *   60 s après. Aucune donnée locale n'est perdue ni écrasée entre-temps —
 *   la `queryFn` lit toujours le store local complet.
 */
export const WORKOUTS_SERVER_REFRESH_WINDOW_MS = 60_000;

export const workoutsServerRefreshGate = createServerRefreshGate({
  windowMs: WORKOUTS_SERVER_REFRESH_WINDOW_MS,
});

/**
 * Rouvre la fenêtre : la prochaine lecture de séances ira réellement au
 * serveur. Appelée au retour du réseau (`useOfflineSync`) et au changement
 * d'utilisateur (`use-auth`).
 */
export function markWorkoutsServerRefreshStale(): void {
  workoutsServerRefreshGate.markStale();
}
