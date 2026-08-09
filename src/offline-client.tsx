import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

/**
 * Point d'entrée CLIENT-ONLY dédié au shell offline (`offline.html`, cf.
 * vite.config.ts `build.rollupOptions.input`). N'amorce QUE l'application
 * client — aucune logique serveur, aucun SSR reproduit ici :
 * `RouterProvider` monte le même arbre de routes que l'app normale
 * (`src/router.tsx`), TanStack Router lit `window.location` et rend
 * directement la route réellement demandée (`/nutrition`, `/fitness`,
 * `/recipes`, ...) — exactement comme une navigation client normale.
 *
 * Ce fichier est un point d'entrée Vite SÉPARÉ de l'app principale (TanStack
 * Start gère son propre entry point via ses "environments" Vite, invisible
 * à `rollupOptions.input`) : il ne modifie ni ne remplace le flux SSR
 * normal, il ne sert que de secours quand le Service Worker sert
 * `offline.html` en `navigateFallback` (réseau indisponible).
 */
const router = getRouter();
const container = document.getElementById("offline-root");
if (container) {
  createRoot(container).render(<RouterProvider router={router} />);
}
