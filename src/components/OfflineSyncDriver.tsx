import { useOfflineSyncDriver } from "@/hooks/useOfflineSync";

/**
 * DRIVER GLOBAL DU MOTEUR OFFLINE — composant NON VISUEL (rend `null`),
 * monté UNE SEULE FOIS dans `routes/_authenticated.tsx`.
 *
 * POURQUOI (CRIT-01, audit du 02/09/2026) : les effets qui font vivre le
 * moteur (balayage périodique, reprise au retour réseau, récupération des
 * opérations `syncing` orphelines, retry/backoff, appel à `processSyncQueue`)
 * vivaient dans `useOfflineSync`, un hook consommé par le SEUL bloc
 * « Synchronisation » du Profil. Hors de cet écran — donc pendant l'essentiel
 * de l'usage réel — plus aucune passe de queue n'était déclenchée : une
 * action faite hors ligne pendant une séance attendait que l'utilisateur
 * ouvre ses paramètres pour partir.
 *
 * CE QUI N'EST PAS REVENU : l'ancien indicateur global de synchronisation
 * (`SyncStatusIndicator` monté dans le layout, qui s'imposait par-dessus
 * n'importe quel écran, cf. audit UI du 01/09/2026). Ce driver n'affiche
 * RIEN. Le statut et le panneau détaillé restent exactement là où ils sont
 * depuis : Profil → Paramètres → « Synchronisation »
 * (`components/profile/SyncStatusCard.tsx`).
 */
export function OfflineSyncDriver() {
  useOfflineSyncDriver();
  return null;
}
