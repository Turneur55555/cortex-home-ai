/**
 * Enregistrement explicite du Service Worker côté client. L'injection
 * automatique de `vite-plugin-pwa` (`injectRegister: "inline"`) dépend du
 * hook `transformIndexHtml` de Vite sur un `index.html` statique — ce
 * projet n'en a pas (shell rendu par TanStack Start/SSR, cf.
 * `src/routes/__root.tsx`), donc rien n'était jamais injecté et le SW
 * n'était jamais enregistré en production. Appelé explicitement ici à la
 * place, uniquement côté client (jamais pendant le SSR).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] échec de l'enregistrement du Service Worker", err);
    });
  });
}
