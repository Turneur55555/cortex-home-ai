// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        // injectRegister: null pour éviter les conflits avec le SSR TanStack Start
        injectRegister: "inline",
        includeAssets: ["icons/apple-touch-icon.png"],
        manifest: {
          name: "ICORTEX",
          short_name: "ICORTEX",
          description: "ICORTEX Home AI — gestion intelligente de la maison et de la santé",
          theme_color: "#0d0d14",
          background_color: "#0d0d14",
          display: "standalone",
          start_url: "/",
          orientation: "portrait",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        workbox: {
          // NetworkFirst pour les requêtes Supabase
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-api",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 60, maxAgeSeconds: 5 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // CacheFirst pour les assets statiques
            {
              urlPattern: /\.(?:js|css|woff2?|png|svg|ico|webp)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
    ],
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
