import { describe, it, expect } from "vitest";
import {
  characterLevelForXp,
  xpAtLevelStart,
  xpAtNextLevel,
  characterLevelProgress,
  XP_LEVEL_DIVISOR,
} from "./characterLevel";

// Réplique locale de la courbe serveur pour prouver l'équivalence :
//   level = FLOOR(SQRT(xp / 50)) + 1
function serverLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

describe("characterLevel — équivalence avec la courbe serveur", () => {
  it("miroir exact de compute_level_from_xp sur un large échantillon", () => {
    for (const xp of [0, 1, 49, 50, 51, 199, 200, 201, 449, 450, 4500, 5000, 12_800, 50_000]) {
      expect(characterLevelForXp(xp)).toBe(serverLevel(xp));
    }
  });

  it("points de repère lisibles", () => {
    expect(characterLevelForXp(0)).toBe(1);
    expect(characterLevelForXp(50)).toBe(2); // 50·1²
    expect(characterLevelForXp(200)).toBe(3); // 50·2²
    expect(characterLevelForXp(450)).toBe(4); // 50·3²
    expect(characterLevelForXp(4500)).toBe(10); // 50·9² = 4050 → niveau 10 à partir de 4050
  });

  it("XP négative ou nulle → niveau 1", () => {
    expect(characterLevelForXp(-100)).toBe(1);
    expect(characterLevelForXp(0)).toBe(1);
  });
});

describe("characterLevel — bornes de palier", () => {
  it("le début d'un niveau donne exactement ce niveau", () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(characterLevelForXp(xpAtLevelStart(lvl))).toBe(lvl);
    }
  });

  it("xpAtNextLevel(L) === xpAtLevelStart(L+1)", () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(xpAtNextLevel(lvl)).toBe(xpAtLevelStart(lvl + 1));
    }
  });

  it("un XP juste sous le palier suivant reste au niveau courant", () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(characterLevelForXp(xpAtNextLevel(lvl) - 1)).toBe(lvl);
    }
  });

  it("le diviseur est bien celui du serveur", () => {
    expect(XP_LEVEL_DIVISOR).toBe(50);
  });
});

describe("characterLevelProgress", () => {
  it("début de niveau : progression 0", () => {
    const p = characterLevelProgress(50); // début niveau 2
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.progress).toBe(0);
    expect(p.levelStartXp).toBe(50);
    expect(p.nextLevelXp).toBe(200);
    expect(p.xpToNext).toBe(150);
  });

  it("milieu de niveau : progression cohérente", () => {
    const p = characterLevelProgress(125); // niveau 2, entre 50 et 200
    expect(p.level).toBe(2);
    expect(p.xpForLevelSpan).toBe(150);
    expect(p.xpIntoLevel).toBe(75);
    expect(p.progress).toBeCloseTo(0.5, 5);
    expect(p.xpToNext).toBe(75);
  });

  it("progression toujours dans [0,1]", () => {
    for (const xp of [0, 10, 50, 199, 200, 4500, 99_999]) {
      const p = characterLevelProgress(xp);
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThanOrEqual(1);
    }
  });

  it("XP fractionnaire tronquée, jamais de niveau < 1", () => {
    const p = characterLevelProgress(-5);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.progress).toBe(0);
  });
});
