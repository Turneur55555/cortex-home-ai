// Génère le Service Worker (Workbox, via `workbox-build` — même moteur que
// `vite-plugin-pwa`) en POST-BUILD, une fois `.output/public/` réellement
// peuplé par les deux passes de build (app principale via TanStack
// Start/Nitro, puis shell offline via vite.offline-shell.config.ts).
//
// Pourquoi pas `vite-plugin-pwa` directement dans vite.config.ts : son hook
// s'exécute pendant le build Vite "client" par défaut, dont le `outDir`
// résolu (`dist/`) n'a rien à voir avec la sortie réelle déployée par
// Nitro/Cloudflare (`.output/public/`) — le SW généré précachait alors 4
// fichiers statiques et zéro JS/CSS applicatif (bug diagnostiqué : le shell
// offline n'était jamais servable hors connexion). Exécuter `workbox-build`
// ici, après coup, cible directement le vrai répertoire déployé.
import { generateSW } from "workbox-build";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const PUBLIC_DIR = resolve(import.meta.dirname, "../.output/public");
export const SW_DEST = resolve(PUBLIC_DIR, "sw.js");

/** Extrait les chemins des <script src> / <link href> injectés par Vite dans le shell offline. */
export async function shellAssetUrls(offlineShellPath) {
  const html = await readFile(offlineShellPath, "utf8");
  const urls = new Set(["/offline.html"]);
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    urls.add(m[1]);
  }
  return [...urls];
}

/** Assemble les options `workbox-build#generateSW` — pure, testable sans build réel. */
export function buildSwOptions({ publicDir, swDest, shellUrls, now = Date.now() }) {
  return {
    swDest,
    globDirectory: publicDir,
    // Précache MINIMAL et explicite : uniquement le shell offline + ses
    // propres assets (JS/CSS de src/offline-client.tsx) + le nécessaire au
    // PWA install prompt (manifest, icônes). Pas de glob large sur tout
    // `.output/public/assets/**` : les dizaines de chunks par route de
    // l'app principale restent mis en cache À L'USAGE via la règle
    // runtimeCaching CacheFirst ci-dessous (déjà en place, comportement
    // online inchangé) — pas de sur-ingénierie, pas de doublon de stratégie.
    globPatterns: [],
    additionalManifestEntries: [
      ...shellUrls,
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/apple-touch-icon.png",
    ].map((url) => ({ url, revision: `${now}` })),
    // Le shell offline sert de secours pour TOUTE navigation (route
    // interne comprise, ex. /nutrition, /fitness, /recipes) quand aucune
    // réponse n'est disponible en cache — une fois chargé, le routeur
    // client (src/offline-client.tsx) rend la vraie route demandée.
    navigateFallback: "/offline.html",
    // Jamais de fallback shell pour les endpoints serveur (server
    // functions TanStack Start, edge functions Supabase proxées côté
    // origine si un jour ajoutées) — ces requêtes doivent échouer
    // normalement hors connexion, pas recevoir un document HTML.
    navigateFallbackDenylist: [/^\/_serverFn\//, /^\/api\//],
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // NetworkFirst pour les requêtes Supabase (API/DB) — comportement
      // online inchangé (repris tel quel de l'ancienne config vite-plugin-pwa).
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
      // CacheFirst pour les assets statiques (mise en cache à l'usage,
      // hors du précache — c'est ce qui permet à une route déjà visitée
      // en ligne de rester utilisable hors connexion sans tout précacher).
      {
        urlPattern: /\.(?:js|css|woff2?|png|svg|ico|webp)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
    ],
  };
}

async function main() {
  const offlineShellPath = resolve(PUBLIC_DIR, "offline.html");
  const shellUrls = await shellAssetUrls(offlineShellPath);

  const { count, size, warnings } = await generateSW(
    buildSwOptions({ publicDir: PUBLIC_DIR, swDest: SW_DEST, shellUrls }),
  );

  if (warnings.length > 0) {
    console.warn("[generate-sw] warnings:", warnings);
  }
  console.log(
    `[generate-sw] ${SW_DEST} — ${count} entrées précachées (${(size / 1024).toFixed(1)} KiB)`,
  );

  // sw.js doit être servi depuis la racine (scope /) — vérifie qu'aucun
  // header ne le mettrait en cache HTTP long (sinon une mise à jour ne
  // serait jamais détectée). Nitro/_headers gère déjà les autres assets ;
  // on ajoute une règle dédiée courte pour sw.js si absente.
  const headersPath = resolve(PUBLIC_DIR, "_headers");
  try {
    const headers = await readFile(headersPath, "utf8");
    if (!headers.includes("/sw.js")) {
      await writeFile(headersPath, `${headers}\n/sw.js\n  Cache-Control: no-cache\n`, "utf8");
    }
  } catch {
    // Pas de fichier _headers généré (setup Nitro différent) — pas bloquant.
  }
}

// N'exécute `main()` que lorsque ce fichier est lancé directement (`node
// scripts/generate-sw.mjs`, cf. package.json "build") — jamais lors d'un
// `import` depuis les tests (scripts/generate-sw.test.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[generate-sw] échec :", err);
    process.exit(1);
  });
}
