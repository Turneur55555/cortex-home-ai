// Dossier où le build principal écrit le site PUBLIÉ — source unique pour
// les deux étapes post-build (shell offline, Service Worker).
//
// Pourquoi ce module existe : `@lovable.dev/vite-tanstack-config` change la
// sortie de Nitro quand il tourne dans le bac à sable Lovable (là où le site
// est construit puis publié) : `dist/client` au lieu de `.output/public`.
// Les étapes post-build écrivaient en dur dans `.output/public` : en local
// tout marchait, mais sur Lovable `offline.html` et `sw.js` partaient dans un
// dossier jamais publié. Mesuré en production (error_logs, octobre 2026) :
// `/sw.js` répondait 404 — aucun démarrage hors connexion possible.
//
// La détection reprend À L'IDENTIQUE `isSandboxEnvironment()` du paquet
// (node_modules/@lovable.dev/vite-tanstack-config/dist/index.js) : le
// moindre écart reproduirait le bug.
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

export function isLovableSandbox(env = process.env) {
  return env.LOVABLE_SANDBOX === "1" || !!env.DEV_SERVER__PROJECT_PATH;
}

/** Dossier public du site construit (celui qui est réellement publié). */
export function resolvePublicDir(env = process.env, root = ROOT) {
  return resolve(root, isLovableSandbox(env) ? "dist/client" : ".output/public");
}
