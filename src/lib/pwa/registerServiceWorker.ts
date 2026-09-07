/**
 * Enregistrement explicite du Service Worker côté client. L'injection
 * automatique de `vite-plugin-pwa` (`injectRegister: "inline"`) dépend du
 * hook `transformIndexHtml` de Vite sur un `index.html` statique — ce
 * projet n'en a pas (shell rendu par TanStack Start/SSR, cf.
 * `src/routes/__root.tsx`), donc rien n'était jamais injecté et le SW
 * n'était jamais enregistré en production. Appelé explicitement ici à la
 * place, uniquement côté client (jamais pendant le SSR).
 *
 * CHANTIER FINAL (AUD-07) — `load` A PU DÉJÀ ÊTRE ÉMIS.
 * ------------------------------------------------------
 * Cette fonction est appelée depuis un `useEffect` de `__root.tsx`, donc
 * APRÈS le rendu. `window.addEventListener("load", …)` posé à ce moment-là
 * n'est jamais rappelé si l'événement `load` est déjà passé : le Service
 * Worker n'est alors JAMAIS enregistré, donc le shell offline n'est jamais
 * précaché et l'application ne démarre pas hors connexion.
 *
 * Ce n'est pas théorique : mesuré en direct sur le build (`.output/public`
 * servi statiquement, 2026-09-07) — `document.readyState` valait déjà
 * `"complete"` quand l'effet tournait, aucune inscription n'existait, et un
 * enregistrement manuel immédiat fonctionnait. C'est une COURSE : elle se
 * gagne quand la page a encore des ressources en vol (polices, images) au
 * moment de l'hydratation, et se perd quand tout est déjà chargé — d'où un
 * comportement intermittent, particulièrement pénible à diagnostiquer.
 *
 * On teste donc l'état réel du document plutôt que de parier sur un
 * événement futur.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] échec de l'enregistrement du Service Worker", err);
    });
  };

  // Document déjà entièrement chargé : `load` ne sera plus émis, on
  // enregistre tout de suite.
  if (document.readyState === "complete") {
    register();
    return;
  }
  // Sinon on attend `load` — enregistrer plus tôt ferait concurrence aux
  // ressources de la première peinture. `once` garantit un seul appel.
  window.addEventListener("load", register, { once: true });
}
