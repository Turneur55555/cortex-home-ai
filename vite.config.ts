// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      // Seuil d'alerte pour les chunks (en Ko)
      chunkSizeWarningLimit: 600,
      // esbuild est inclus dans Vite — rapide, sans dépendance externe
      minify: "esbuild",
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes("node_modules")) {
              // UI — Radix + lucide-react
              if (
                id.includes("@radix-ui") ||
                id.includes("lucide-react")
              ) {
                return "vendor-ui";
              }
              // Charts — recharts (d3 non présent en dépendance directe)
              if (id.includes("recharts")) {
                return "vendor-charts";
              }
              // Supabase
              if (id.includes("@supabase")) {
                return "vendor-supabase";
              }
              // TanStack — router + query + start
              if (id.includes("@tanstack")) {
                return "vendor-tanstack";
              }
              // React core
              if (
                id.includes("react-dom") ||
                id.includes("react/")
              ) {
                return "vendor-react";
              }
            }
          },
        },
      },
    },
  },
});
