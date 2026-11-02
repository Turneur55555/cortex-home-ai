import { useEffect } from "react";

/**
 * Garde l'écran allumé tant que `active` est vrai — pendant une séance en cours.
 *
 * Pourquoi (01/11/2026) : écran verrouillé, iOS suspend la page ; le minuteur de repos ne peut
 * alors ni sonner ni se mettre à jour, et l'iPhone n'a ni vibration ni notification locale pour
 * prendre le relais. Garder l'écran allumé pendant la séance est le seul moyen fiable que la fin
 * du repos s'entende et se voie.
 *
 * API Screen Wake Lock (Safari iOS 16.4+, Chrome) : le verrou est relâché par le navigateur dès
 * que la page passe en arrière-plan ; il est donc redemandé à chaque retour à l'écran. Sans API,
 * ou en cas de refus (batterie faible…), rien ne se passe : dégradation silencieuse.
 */
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || typeof document === "undefined") return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock?.request) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;
    let requesting = false;

    const acquire = async () => {
      if (disposed || requesting || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      requesting = true;
      try {
        const next = await wakeLock.request("screen");
        if (disposed) {
          next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        // Refus du navigateur (économie d'énergie, onglet non visible) : sans conséquence.
      } finally {
        requesting = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel && !sentinel.released) sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
