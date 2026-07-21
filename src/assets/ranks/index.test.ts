import { describe, expect, it } from "vitest";
import { getPlaceholderIllustration, getRankIllustration } from "./index";

const RANK_KEYS = ["mortel", "guerrier", "heros", "titan", "olympien", "primordial"] as const;

describe("getRankIllustration", () => {
  it("retourne l'illustration propre à chaque rang, jamais celle d'un autre", () => {
    const srcByKey = new Map(RANK_KEYS.map((key) => [key, getRankIllustration(key)]));

    for (const key of RANK_KEYS) {
      const src = srcByKey.get(key);
      expect(src, `illustration manquante pour "${key}"`).toBeTruthy();
      // Le fichier résolu doit porter le nom du rang demandé...
      expect(src).toEqual(expect.stringContaining(key));
      // ...et ne jamais correspondre au fichier d'un autre rang.
      for (const otherKey of RANK_KEYS) {
        if (otherKey === key) continue;
        expect(src).not.toBe(srcByKey.get(otherKey));
      }
    }
  });

  it("retourne null pour un rang sans fichier dédié (pas de repli inter-rang)", () => {
    // @ts-expect-error — clé volontairement invalide pour vérifier l'absence de repli.
    expect(getRankIllustration("inexistant")).toBeNull();
  });

  it("n'a pas de placeholder.webp déposé à ce jour", () => {
    expect(getPlaceholderIllustration()).toBeNull();
  });
});
