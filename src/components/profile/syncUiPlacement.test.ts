import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE-FOU DE CONVENTION — deux règles distinctes, souvent confondues :
 *
 * 1. LA SYNCHRONISATION NE S'IMPOSE JAMAIS PAR-DESSUS L'ÉCRAN (audit UI du
 *    01/09/2026). Avant, `SyncStatusIndicator` était monté GLOBALEMENT dans
 *    `routes/_authenticated.tsx` : il apparaissait sur n'importe quel écran
 *    dès qu'une action était en attente — donc après quasiment chaque geste
 *    pendant une séance. Depuis, le statut et le panneau détaillé vivent
 *    uniquement dans le bloc « Synchronisation » du Profil.
 *
 * 2. LE MOTEUR, LUI, DOIT TOURNER PARTOUT (CRIT-01, 02/09/2026). L'audit UI
 *    avait laissé les EFFETS du moteur dans `useOfflineSync`, consommé par ce
 *    seul bloc du Profil : hors de cet écran, plus aucune passe de queue
 *    n'était déclenchée. Ils sont désormais portés par un driver NON VISUEL
 *    (`components/OfflineSyncDriver.tsx`) monté une seule fois au niveau
 *    authentifié global.
 *
 * Un test de rendu ne suffirait pas à protéger ça : les régressions
 * consistent à REMONTER de l'UI de synchronisation dans un layout global, ou
 * à REDESCENDRE les effets du moteur dans un composant d'écran. On relit donc
 * les sources — aucune liste à maintenir à la main, elle est dérivée du code
 * réel à chaque exécution.
 */

const SRC = join(process.cwd(), "src");
const CARD = join(SRC, "components/profile/SyncStatusCard.tsx");
const DRIVER = join(SRC, "components/OfflineSyncDriver.tsx");
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

/** Source débarrassée de ses commentaires — ils PARLENT des composants qu'ils
 *  documentent, ils n'en montent aucun. */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

/** Fichiers qui importent ce symbole en tant que VALEUR (pas un `import type`). */
function valueImportersOf(symbol: string): string[] {
  return SOURCE_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return new RegExp(`import\\s*\\{[^}]*\\b${symbol}`).test(source);
  }).map((file) => relative(SRC, file));
}

describe("placement de l'UI de synchronisation", () => {
  it("TEST UI 1 — le panneau détaillé n'est monté QUE depuis le bloc Profil", () => {
    const mounts = SOURCE_FILES.filter((file) =>
      readFileSync(file, "utf8").includes("<SyncQueueSheet"),
    ).map((file) => relative(SRC, file));

    expect(mounts).toEqual(["components/profile/SyncStatusCard.tsx"]);
  });

  it("TEST UI 1 bis — aucun layout global ne monte d'UI de synchronisation", () => {
    const layout = codeOf(AUTHENTICATED_LAYOUT);
    expect(layout).not.toContain("SyncStatusIndicator");
    expect(layout).not.toContain("SyncQueueSheet");
    expect(layout).not.toContain("SyncStatusCard");
    // Le hook de LECTURE n'a rien à faire dans un layout : il n'existe que
    // pour afficher l'état, et le driver ne l'utilise pas.
    expect(layout).not.toMatch(/import\s*\{[^}]*\buseOfflineSync\b[^}]*\}/);
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

  it("SyncStatusCard est une UI de LECTURE : elle ne porte aucun effet du moteur", () => {
    const card = readFileSync(CARD, "utf8");
    // Aucun effet (poll, timer, écoute réseau) : tout ça appartient au driver.
    expect(card).not.toContain("useEffect");
    expect(card).not.toContain("setInterval");
    expect(card).not.toContain("useOfflineSyncDriver");
    expect(card).not.toContain("visibilitychange");
    // Elle consomme le hook de lecture, et lui seul.
    expect(card).toContain("useOfflineSync()");
  });
});

describe("driver du moteur offline (CRIT-01)", () => {
  it("le driver est monté au niveau authentifié GLOBAL", () => {
    const layout = readFileSync(AUTHENTICATED_LAYOUT, "utf8");
    expect(layout).toContain('from "@/components/OfflineSyncDriver"');
    expect(layout).toContain("<OfflineSyncDriver />");
  });

  it("il n'existe qu'UNE SEULE instance du driver dans toute l'application", () => {
    const mounts = SOURCE_FILES.flatMap((file) => {
      const occurrences = codeOf(file).match(/<OfflineSyncDriver\b/g) ?? [];
      return occurrences.map(() => relative(SRC, file));
    });

    expect(mounts).toEqual(["routes/_authenticated.tsx"]);
  });

  it("le driver est NON VISUEL et porte les effets permanents du moteur", () => {
    const driver = readFileSync(DRIVER, "utf8");
    expect(driver).toContain("useOfflineSyncDriver()");
    expect(driver).toContain("return null");

    const hook = readFileSync(join(SRC, "hooks/useOfflineSync.ts"), "utf8");
    // Les effets qui font vivre le moteur appartiennent au driver, pas au
    // hook de lecture : ils sont tous dans `useOfflineSyncDriver`.
    const driverHook = hook.slice(
      hook.indexOf("export function useOfflineSyncDriver"),
      hook.indexOf("export function useOfflineSync("),
    );
    expect(driverHook).toContain("setInterval");
    expect(driverHook).toContain("visibilitychange");
    expect(driverHook).toContain("attemptSync");
  });

  it("un seul consommateur du driver, un seul consommateur du hook de lecture", () => {
    // Le driver n'est utilisé QUE par le composant driver…
    expect(valueImportersOf("useOfflineSyncDriver")).toEqual(["components/OfflineSyncDriver.tsx"]);
    // …et le hook de LECTURE `useOfflineSync` QUE par le bloc Profil (l'UI de
    // synchronisation reste rangée dans les Paramètres, cf. audit UI du
    // 01/09/2026). `SyncQueueSheet` n'en importe que le TYPE
    // `OfflineSyncState`, ce qui ne monte rien.
    expect(valueImportersOf("useOfflineSync(?![A-Za-z])")).toEqual([
      "components/profile/SyncStatusCard.tsx",
    ]);
  });

  it("aucune seconde boucle de polling : `processSyncQueue` n'est lancé que par le runtime partagé", () => {
    const callers = SOURCE_FILES.filter((file) =>
      /import\s*\{[^}]*\bprocessSyncQueue\b/.test(readFileSync(file, "utf8")),
    ).map((file) => relative(SRC, file));

    // `syncRuntime` porte le verrou de passe unique (driver + actions de
    // l'UI) ; `syncFlush` est le coup de pouce ponctuel de la clôture de
    // séance (chantier 4, CRIT-03), volontairement sans boucle ni timer.
    expect(callers.sort()).toEqual(["lib/offline/syncFlush.ts", "lib/offline/syncRuntime.ts"]);

    for (const file of [
      join(SRC, "lib/offline/syncFlush.ts"),
      join(SRC, "lib/offline/syncRuntime.ts"),
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("setInterval");
    }
  });
});
