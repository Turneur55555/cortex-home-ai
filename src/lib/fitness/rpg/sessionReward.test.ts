import { describe, it, expect } from "vitest";
import { totalSessionXp, buildXpBreakdown, buildLevelTransition } from "./sessionReward";

describe("sessionReward — total & détail", () => {
  it("totalSessionXp somme les montants positifs", () => {
    expect(
      totalSessionXp([
        { source: "workout_muscu", amount: 100 },
        { source: "pr_muscu", amount: 50 },
        { source: "streak", amount: 15 },
      ]),
    ).toBe(165);
  });

  it("ignore les montants nuls/négatifs", () => {
    expect(
      totalSessionXp([
        { source: "workout_muscu", amount: 100 },
        { source: "x", amount: 0 },
        { source: "y", amount: -10 },
      ]),
    ).toBe(100);
  });

  it("buildXpBreakdown ordonne selon la hiérarchie muscu-primaire", () => {
    const lines = buildXpBreakdown([
      { source: "streak", amount: 15 },
      { source: "workout_muscu", amount: 100 },
      { source: "pr_muscu", amount: 50 },
    ]);
    expect(lines.map((l) => l.source)).toEqual(["workout_muscu", "pr_muscu", "streak"]);
    expect(lines[0].label).toBe("Séance de musculation");
  });

  it("agrège les events d'une même source", () => {
    const lines = buildXpBreakdown([
      { source: "workout_support", amount: 25 },
      { source: "workout_support", amount: 25 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(50);
  });

  it("source inconnue → repli neutre, placé en dernier", () => {
    const lines = buildXpBreakdown([
      { source: "mystere", amount: 5 },
      { source: "workout_muscu", amount: 100 },
    ]);
    expect(lines[0].source).toBe("workout_muscu");
    expect(lines[1].label).toBe("Bonus");
  });

  it("liste vide → total 0, détail vide", () => {
    expect(totalSessionXp([])).toBe(0);
    expect(buildXpBreakdown([])).toEqual([]);
  });
});

describe("sessionReward — transition de niveau", () => {
  it("sans passage de niveau", () => {
    const t = buildLevelTransition(60, 160); // niveau 2 (50..200) avant et après
    expect(t.levelBefore).toBe(2);
    expect(t.levelAfter).toBe(2);
    expect(t.leveledUp).toBe(false);
    expect(t.levelsGained).toBe(0);
  });

  it("passage de niveau détecté", () => {
    const t = buildLevelTransition(160, 260); // 2 → 3 (200)
    expect(t.levelBefore).toBe(2);
    expect(t.levelAfter).toBe(3);
    expect(t.leveledUp).toBe(true);
    expect(t.levelsGained).toBe(1);
  });

  it("plusieurs niveaux gagnés", () => {
    const t = buildLevelTransition(0, 460); // niveau 1 → 4 (450)
    expect(t.levelsGained).toBe(3);
    expect(t.leveledUp).toBe(true);
  });

  it("xpAfter jamais sous xpBefore (robustesse)", () => {
    const t = buildLevelTransition(500, 100);
    expect(t.xpAfter).toBeGreaterThanOrEqual(t.xpBefore);
    expect(t.leveledUp).toBe(false);
  });

  it("progressions dans [0,1]", () => {
    const t = buildLevelTransition(75, 190);
    expect(t.progressBefore).toBeGreaterThanOrEqual(0);
    expect(t.progressBefore).toBeLessThanOrEqual(1);
    expect(t.progressAfter).toBeGreaterThanOrEqual(0);
    expect(t.progressAfter).toBeLessThanOrEqual(1);
  });
});
