import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE-FOU DE CONVENTION — la synchronisation ne doit plus jamais s'imposer
 * par-dessus l'écran (audit UI du 01/09/2026).
 *
 * Avant : `SyncStatusIndicator` était monté GLOBALEMENT dans
 * `routes/_authenticated.tsx`. Il apparaissait donc sur n'importe quel écran
 * dès qu'une action était en attente — c'est-à-dire après quasiment chaque
 * geste pendant une séance — et c'était le seul point d'accès au grand
 * panneau. Depuis, le statut et le panneau vivent dans le bloc
 * « Synchronisation » du Profil.
 *
 * Un test de rendu ne suffirait pas à protéger ça : la régression consiste à
 * REMONTER un composant de synchronisation dans un layout global. On relit
 * donc les sources — aucune liste à maintenir à la main, elle est dérivée du
 * code réel à chaque exécution.
 */

const SRC = join(process.cwd(), "src");
const CARD = join(SRC, "components/profile/SyncStatusCard.tsx");
const AUTHENTICATED_LAYOUT = join(SRC, "routes/_authenticated.tsx");
const PROFIL_ROUTE = join(SRC, "routes/_authenticated/profil.tsx");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const SOURCE_FILES = listSourceFiles(SRC);

describe("placement de l'UI de synchronisation", () => {
  it("TEST UI 1 — le panneau détaillé n'est monté QUE depuis le bloc Profil", () => {
    const mounts = SOURCE_FILES.filter((file) =>
      readFileSync(file, "utf8").includes("<SyncQueueSheet"),
    ).map((file) => relative(SRC, file));

    expect(mounts).toEqual(["components/profile/SyncStatusCard.tsx"]);
  });

  it("TEST UI 1 bis — aucun layout global ne monte d'UI de synchronisation", () => {
    const layout = readFileSync(AUTHENTICATED_LAYOUT, "utf8");
    expect(layout).not.toContain("SyncStatusIndicator");
    expect(layout).not.toContain("SyncQueueSheet");
    expect(layout).not.toContain("useOfflineSync");
  });

  it("TEST UI 1 ter — `useOfflineSync` n'est consommé que par le bloc Profil", () => {
    const consumers = SOURCE_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      // Import de VALEUR uniquement : `SyncQueueSheet` importe le type
      // `OfflineSyncState`, ce qui ne monte aucune UI.
      return /import\s*\{[^}]*\buseOfflineSync\b/.test(source);
    }).map((file) => relative(SRC, file));

    expect(consumers).toEqual(["components/profile/SyncStatusCard.tsx"]);
  });

  it("TEST UI 2 — le bloc Synchronisation est monté dans l'écran Profil", () => {
    const profil = readFileSync(PROFIL_ROUTE, "utf8");
    expect(profil).toContain('from "@/components/profile/SyncStatusCard"');
    expect(profil).toContain("<SyncStatusCard />");
  });

  it("le bloc réutilise le moteur existant, il n'en crée pas un second", () => {
    const card = readFileSync(CARD, "utf8");
    // Il lit le hook central et rouvre le panneau existant…
    expect(card).toContain('from "@/hooks/useOfflineSync"');
    expect(card).toContain('from "@/components/shared/SyncQueueSheet"');
    // …et ne touche JAMAIS au moteur lui-même.
    expect(card).not.toContain("processSyncQueue");
    expect(card).not.toContain("enqueueOperation");
    expect(card).not.toContain("claimOperation");
    // Chemins exacts (guillemet fermant compris) : le bloc importe bien
    // `@/lib/offline/syncQueueSummary`, qui est de la mise en forme pure.
    expect(card).not.toContain('@/lib/offline/syncEngine"');
    expect(card).not.toContain('@/lib/offline/syncQueue"');
  });
});
