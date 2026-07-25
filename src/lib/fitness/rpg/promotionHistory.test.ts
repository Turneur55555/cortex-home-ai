import { describe, it, expect } from "vitest";
import { buildPromotionEvents } from "./promotionHistory";

describe("buildPromotionEvents", () => {
  it("trie du plus récent (tier_index le plus haut) au plus ancien", () => {
    const events = buildPromotionEvents([
      { tier_index: 0, xp_at_promotion: 0, created_at: "2026-01-01T00:00:00Z" },
      { tier_index: 5, xp_at_promotion: 1800, created_at: "2026-02-01T00:00:00Z" },
      { tier_index: 2, xp_at_promotion: 550, created_at: "2026-01-15T00:00:00Z" },
    ]);
    expect(events.map((e) => e.tierIndex)).toEqual([5, 2, 0]);
  });

  it("marque isRankUp uniquement au 1er grade d'un titre (tier_index multiple de 5)", () => {
    const events = buildPromotionEvents([
      { tier_index: 0, xp_at_promotion: 0, created_at: "2026-01-01T00:00:00Z" },
      { tier_index: 1, xp_at_promotion: 200, created_at: "2026-01-05T00:00:00Z" },
      { tier_index: 5, xp_at_promotion: 1800, created_at: "2026-02-01T00:00:00Z" },
    ]);
    const byTier = new Map(events.map((e) => [e.tierIndex, e]));
    expect(byTier.get(0)?.isRankUp).toBe(true);
    expect(byTier.get(1)?.isRankUp).toBe(false);
    expect(byTier.get(5)?.isRankUp).toBe(true);
  });

  it("résout rangKey/rankLabel/gradeLabel depuis titleConfig, sans dupliquer les libellés", () => {
    const [event] = buildPromotionEvents([
      { tier_index: 6, xp_at_promotion: 2600, created_at: "2026-02-10T00:00:00Z" },
    ]);
    expect(event.rankKey).toBe("guerrier");
    expect(event.rankLabel).toBe("Guerrier");
    expect(event.gradeLabel).toBe("Vétéran");
    expect(event.isRankUp).toBe(false);
  });
});
