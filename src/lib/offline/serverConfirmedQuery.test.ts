import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOfflineFirstQuery } from "./offlineQuery";
import { isServerConfirmedQuery, SERVER_CONFIRMED_QUERY_OPTIONS } from "./serverConfirmedQuery";

/**
 * CHANTIER 4 — MAJ-08 + non-régression du chantier 3.
 *
 * Le chantier 3 a rendu l'invalidation post-synchronisation CIBLÉE (jamais un
 * `invalidateQueries()` global au retour du réseau). Le chantier 4 lui ajoute
 * une SECONDE catégorie — les queries dont la valeur est produite par un
 * trigger serveur à partir de ce qu'on vient de pousser. Ces tests fixent les
 * deux garanties à la fois :
 *   1. les deux marqueurs restent indépendants et bien distincts ;
 *   2. `useOfflineSync` n'invalide toujours QUE par prédicat, jamais tout le
 *      cache, et rafraîchit bien la progression RPG après un passage réussi.
 */

const ROOT = process.cwd();
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), "utf8");

describe("isServerConfirmedQuery", () => {
  it("vrai pour une query portant le marqueur", () => {
    expect(isServerConfirmedQuery({ meta: SERVER_CONFIRMED_QUERY_OPTIONS.meta })).toBe(true);
  });

  it("faux sans marqueur (défaut : online-only ordinaire)", () => {
    expect(isServerConfirmedQuery({ meta: undefined })).toBe(false);
    expect(isServerConfirmedQuery({ meta: {} })).toBe(false);
  });

  it("indépendant du marqueur offline-first — une query offline-first n'est pas server-confirmed", () => {
    expect(isServerConfirmedQuery({ meta: { offlineFirst: true } })).toBe(false);
    expect(isOfflineFirstQuery({ meta: SERVER_CONFIRMED_QUERY_OPTIONS.meta })).toBe(false);
  });
});

describe("MAJ-08 — la progression RPG est rafraîchie après une synchronisation", () => {
  const RPG_SERVER_QUERIES = [
    ["src/hooks/useUserStats.ts", "XP / Niveau (source du Rang affiché)"],
    ["src/hooks/useRankPromotions.ts", "historique des promotions de Rang"],
    ["src/hooks/useSessionReward.ts", "récompense de fin de séance"],
  ] as const;

  it.each(RPG_SERVER_QUERIES)("%s porte le marqueur server-confirmed (%s)", (file) => {
    expect(read(file)).toContain("SERVER_CONFIRMED_QUERY_OPTIONS");
  });

  it("useOfflineSync invalide bien les deux catégories après un passage réussi", () => {
    const source = read("src/hooks/useOfflineSync.ts");
    expect(source).toContain("predicate: isOfflineFirstQuery");
    expect(source).toContain("predicate: isServerConfirmedQuery");
  });

  it("non-régression chantier 3 : aucune invalidation GLOBALE au retour du réseau", () => {
    // Les commentaires du fichier PARLENT de `invalidateQueries()` global
    // pour expliquer pourquoi il est proscrit : on ne scanne que le code.
    const source = read("src/hooks/useOfflineSync.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Un `invalidateQueries()` sans argument relancerait des dizaines de
    // requêtes sans rapport avec la synchronisation.
    expect(source).not.toMatch(/invalidateQueries\(\s*\)/);
    for (const call of source.match(/invalidateQueries\(\{[\s\S]*?\}\)/g) ?? []) {
      expect(call).toMatch(/predicate:|queryKey:/);
    }
  });
});
