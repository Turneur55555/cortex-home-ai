import { describe, it, expect } from "vitest";
import {
  computeSeasonTier,
  seasonTierProgress,
  seasonDaysRemaining,
  seasonTimeProgress,
  PS_PER_TIER,
  MAX_TIER,
} from "./season";

// Réplique de la courbe serveur `compute_season_tier` : floor(ps/100), max 50.
function serverTier(ps: number): number {
  return Math.min(50, Math.max(0, Math.floor(Math.max(0, ps) / 100)));
}

describe("season — courbe de paliers (miroir serveur)", () => {
  it("équivalence avec compute_season_tier", () => {
    for (const ps of [0, 1, 99, 100, 101, 250, 4999, 5000, 5001, 10_000]) {
      expect(computeSeasonTier(ps)).toBe(serverTier(ps));
    }
  });

  it("points de repère", () => {
    expect(computeSeasonTier(0)).toBe(0);
    expect(computeSeasonTier(100)).toBe(1);
    expect(computeSeasonTier(4950)).toBe(49);
    expect(computeSeasonTier(5000)).toBe(50);
  });

  it("plafonné à MAX_TIER", () => {
    expect(computeSeasonTier(999_999)).toBe(MAX_TIER);
  });

  it("PS négatif → palier 0", () => {
    expect(computeSeasonTier(-500)).toBe(0);
  });

  it("constantes cohérentes", () => {
    expect(PS_PER_TIER).toBe(100);
    expect(MAX_TIER).toBe(50);
  });
});

describe("season — progression intra-palier", () => {
  it("début de palier", () => {
    const p = seasonTierProgress(100);
    expect(p.tier).toBe(1);
    expect(p.psIntoTier).toBe(0);
    expect(p.progress).toBe(0);
    expect(p.psToNext).toBe(100);
    expect(p.nextTierPs).toBe(200);
  });

  it("milieu de palier", () => {
    const p = seasonTierProgress(150);
    expect(p.tier).toBe(1);
    expect(p.psIntoTier).toBe(50);
    expect(p.progress).toBeCloseTo(0.5, 5);
    expect(p.psToNext).toBe(50);
  });

  it("palier max → plein et sans reste", () => {
    const p = seasonTierProgress(6000);
    expect(p.tier).toBe(MAX_TIER);
    expect(p.isMax).toBe(true);
    expect(p.progress).toBe(1);
    expect(p.psToNext).toBe(0);
  });

  it("progression toujours dans [0,1]", () => {
    for (const ps of [0, 50, 100, 4999, 5000, 50_000]) {
      const p = seasonTierProgress(ps);
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe("season — temps", () => {
  const start = "2026-07-17T00:00:00.000Z";
  const end = "2026-10-09T00:00:00.000Z"; // +84 jours

  it("jours restants (plancher 0)", () => {
    expect(seasonDaysRemaining(end, new Date("2026-10-08T00:00:00.000Z"))).toBe(1);
    expect(seasonDaysRemaining(end, new Date("2026-10-09T00:00:00.000Z"))).toBe(0);
    expect(seasonDaysRemaining(end, new Date("2026-12-01T00:00:00.000Z"))).toBe(0);
  });

  it("progression temporelle 0..1", () => {
    expect(seasonTimeProgress(start, end, new Date(start))).toBe(0);
    expect(seasonTimeProgress(start, end, new Date(end))).toBe(1);
    expect(seasonTimeProgress(start, end, new Date("2026-08-28T00:00:00.000Z"))).toBeCloseTo(
      0.5,
      1,
    );
  });

  it("fenêtre dégénérée → 0", () => {
    expect(seasonTimeProgress(end, start)).toBe(0);
  });
});
