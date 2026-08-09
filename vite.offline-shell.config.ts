// Build Vite SÉPARÉ et INDÉPENDANT du pipeline SSR TanStack Start, dédié au
// shell offline (offline.html + src/offline-client.tsx). TanStack Start
// rejette explicitement les builds client à entrées multiples
// (`start-manifest-capture-client-build` échoue si >1 entrée) — impossible
// d'ajouter offline.html comme second `input` dans vite.config.ts. Ce build
// standalone n'a donc aucune dépendance à `@lovable.dev/vite-tanstack-config`
// ni à `tanstackStart` : mêmes briques (React, Tailwind, alias `@`) montées
// à la main, uniquement ce qu'il faut pour amorcer le client React seul —
// pas de logique serveur.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: ".output/public",
    // Ne jamais vider .output/public : le build principal (vite build, via
    // package.json "build") y a déjà écrit tout le reste de l'app.
    emptyOutDir: false,
    rollupOptions: {
      input: { offline: "offline.html" },
    },
  },
});
