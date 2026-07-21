import { describe, expect, it } from "vitest";
import { titleProgressForXp } from "./titleProgress";
import { XP_THRESHOLDS, TOTAL_TIERS, GRADE_NAMES_BY_TITLE } from "./titleConfig";
import { RANK_TIERS } from "@/lib/fitness/exerciseRanks";

describe("titleProgressForXp", () => {
  it("part à Mortel — Éveillé pour 0 XP", () => {
    const p = titleProgressForXp(0);
    expect(p.tierIndex).toBe(0);
    expect(p.title.key).toBe("mortel");
    expect(p.grade).toBe("Éveillé");
    expect(p.xpToNext).toBe(XP_THRESHOLDS[1]);
    expect(p.isMax).toBe(false);
  });

  it("traite une XP négative comme 0", () => {
    expect(titleProgressForXp(-50).xp).toBe(0);
  });

  it("atteint pile un seuil de palier", () => {
    const p = titleProgressForXp(XP_THRESHOLDS[5]);
    expect(p.tierIndex).toBe(5);
    expect(p.title.key).toBe("guerrier");
    expect(p.grade).toBe("Aspirant");
  });

  it("reste au palier précédent juste avant le seuil", () => {
    const p = titleProgressForXp(XP_THRESHOLDS[5] - 1);
    expect(p.tierIndex).toBe(4);
    expect(p.title.key).toBe("mortel");
    expect(p.grade).toBe("Émérite");
  });

  it("calcule xpToNext correctement", () => {
    const p = titleProgressForXp(XP_THRESHOLDS[5] + 100);
    expect(p.xpToNext).toBe(XP_THRESHOLDS[6] - (XP_THRESHOLDS[5] + 100));
  });

  it("atteint le palier suprême (Primordial — Omniscient) et plafonne", () => {
    const p = titleProgressForXp(XP_THRESHOLDS[TOTAL_TIERS - 1] + 1_000_000);
    expect(p.tierIndex).toBe(TOTAL_TIERS - 1);
    expect(p.title.key).toBe("primordial");
    expect(p.grade).toBe("Omniscient");
    expect(p.isMax).toBe(true);
    expect(p.xpNextThreshold).toBeNull();
    expect(p.xpToNext).toBe(0);
  });

  it("chaque famille de Titre a exactement 5 grades distincts", () => {
    for (const tier of RANK_TIERS) {
      const grades = GRADE_NAMES_BY_TITLE[tier.key];
      expect(grades).toHaveLength(5);
      expect(new Set(grades).size).toBe(5);
    }
  });

  it("les seuils sont strictement croissants", () => {
    for (let i = 1; i < XP_THRESHOLDS.length; i++) {
      expect(XP_THRESHOLDS[i]).toBeGreaterThan(XP_THRESHOLDS[i - 1]);
    }
  });

  it("le palier est monotone croissant avec l'XP", () => {
    let lastTier = -1;
    for (let xp = 0; xp <= XP_THRESHOLDS[TOTAL_TIERS - 1] + 5000; xp += 250) {
      const tier = titleProgressForXp(xp).tierIndex;
      expect(tier).toBeGreaterThanOrEqual(lastTier);
      lastTier = tier;
    }
  });
});
