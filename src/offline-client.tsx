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
// La racine est montée sur `document`, comme l'app normale (hydratée sur
// `document` par TanStack Start) — JAMAIS sur une div : la route racine rend
// elle-même <html>/<body>, que React s'approprie comme singletons. Montée
// dans une div placée DANS <body>, la racine se retrouvait contenue dans son
// propre <body> : tout `createPortal(…, document.body)` (menu ⋮ de
// Nutrition, feuilles) faisait boucler à l'infini la remontée des événements
// React et figeait la page (constaté le 28/10/2026 : Nutrition inaccessible).
createRoot(document).render(<RouterProvider router={router} />);
