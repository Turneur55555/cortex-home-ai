/**
 * Détection en ligne/hors-ligne — partie pure/testable (zéro React), basée
 * sur `navigator.onLine` + les events `online`/`offline`. Le hook React
 * (`src/hooks/useNetworkStatus.ts`) s'appuie dessus.
 */

export type NetworkListener = (isOnline: boolean) => void;

/** `navigator.onLine` est un indicateur best-effort (pas de vraie vérification de connectivité) — suffisant pour piloter la sync queue. */
export function getIsOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

/** S'abonne aux changements de statut réseau. Retourne une fonction de désinscription. */
export function subscribeToNetworkStatus(listener: NetworkListener): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onOnline = () => listener(true);
  const onOffline = () => listener(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
