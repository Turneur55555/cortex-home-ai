import { describe, expect, it } from "vitest";
import { computeTEF, TEF_COEFFICIENTS } from "./tef";

describe("computeTEF", () => {
  it("returns 0 kcal for a day with no macros logged (never invents a value)", () => {
    const tef = computeTEF({ proteins: 0, carbs: 0, fats: 0 });
    expect(tef).toEqual({
      totalKcal: 0,
      proteinTEF: 0,
      carbsTEF: 0,
      fatTEF: 0,
      method: "macros",
      confidence: "estimate",
    });
  });

  it("computes TEF from protein alone", () => {
    // 100 g × 4 kcal/g × 25 % = 100 kcal
    const tef = computeTEF({ proteins: 100, carbs: 0, fats: 0 });
    expect(tef.proteinTEF).toBe(100);
    expect(tef.carbsTEF).toBe(0);
    expect(tef.fatTEF).toBe(0);
    expect(tef.totalKcal).toBe(100);
  });

  it("computes TEF from carbs alone", () => {
    // 200 g × 4 kcal/g × 7.5 % = 60 kcal
    const tef = computeTEF({ proteins: 0, carbs: 200, fats: 0 });
    expect(tef.carbsTEF).toBe(60);
    expect(tef.totalKcal).toBe(60);
  });

  it("computes TEF from fats alone", () => {
    // 100 g × 9 kcal/g × 2.5 % = 22.5 → 23
    const tef = computeTEF({ proteins: 0, carbs: 0, fats: 100 });
    expect(tef.fatTEF).toBe(23);
    expect(tef.totalKcal).toBe(23);
  });

  it("combines all three macros", () => {
    const tef = computeTEF({ proteins: 100, carbs: 200, fats: 100 });
    expect(tef.proteinTEF).toBe(100);
    expect(tef.carbsTEF).toBe(60);
    expect(tef.fatTEF).toBe(23);
    expect(tef.totalKcal).toBe(183);
  });

  it("handles decimal gram values", () => {
    // 87.5 g × 4 × 0.25 = 87.5 → 88 (round-half-to-even n/a, Math.round → 88)
    const tef = computeTEF({ proteins: 87.5, carbs: 33.3, fats: 12.7 });
    expect(Number.isInteger(tef.proteinTEF)).toBe(true);
    expect(Number.isInteger(tef.carbsTEF)).toBe(true);
    expect(Number.isInteger(tef.fatTEF)).toBe(true);
    expect(Number.isInteger(tef.totalKcal)).toBe(true);
  });

  it("treats invalid (non-numeric) inputs as zero rather than crashing", () => {
    const tef = computeTEF({
      proteins: null,
      carbs: undefined,
      fats: "70" as unknown as number,
    });
    expect(tef).toEqual({
      totalKcal: 0,
      proteinTEF: 0,
      carbsTEF: 0,
      fatTEF: 0,
      method: "macros",
      confidence: "estimate",
    });
  });

  it("clamps negative macro values to zero — never a negative TEF", () => {
    const tef = computeTEF({ proteins: -50, carbs: -100, fats: -20 });
    expect(tef.totalKcal).toBe(0);
    expect(tef.proteinTEF).toBe(0);
    expect(tef.carbsTEF).toBe(0);
    expect(tef.fatTEF).toBe(0);
  });

  it("never propagates NaN", () => {
    const tef = computeTEF({ proteins: NaN, carbs: 100, fats: 50 });
    expect(Number.isNaN(tef.totalKcal)).toBe(false);
    expect(Number.isNaN(tef.proteinTEF)).toBe(false);
    expect(tef.proteinTEF).toBe(0);
  });

  it("never propagates Infinity", () => {
    const tef = computeTEF({ proteins: Infinity, carbs: -Infinity, fats: 50 });
    expect(Number.isFinite(tef.totalKcal)).toBe(true);
    expect(tef.proteinTEF).toBe(0);
    expect(tef.carbsTEF).toBe(0);
  });

  it("rounds the final result to whole kcal", () => {
    const tef = computeTEF({ proteins: 33, carbs: 47, fats: 19 });
    expect(Number.isInteger(tef.totalKcal)).toBe(true);
  });

  it("keeps totalKcal exactly consistent with the sum of its own breakdown", () => {
    const cases = [
      { proteins: 0, carbs: 0, fats: 0 },
      { proteins: 150, carbs: 200, fats: 70 },
      { proteins: 33.7, carbs: 128.2, fats: 41.9 },
      { proteins: 1, carbs: 1, fats: 1 },
    ];
    for (const macros of cases) {
      const tef = computeTEF(macros);
      expect(tef.totalKcal).toBe(tef.proteinTEF + tef.carbsTEF + tef.fatTEF);
    }
  });

  it("computes a realistic full-day example", () => {
    // 150 g protéines, 200 g glucides, 70 g lipides
    const tef = computeTEF({ proteins: 150, carbs: 200, fats: 70 });
    expect(tef.proteinTEF).toBe(150); // 150×4×0.25 = 150
    expect(tef.carbsTEF).toBe(60); // 200×4×0.075 = 60
    expect(tef.fatTEF).toBe(16); // 70×9×0.025 = 15.75 → 16
    expect(tef.totalKcal).toBe(226);
    expect(tef.method).toBe("macros");
    expect(tef.confidence).toBe("estimate");
  });

  it("exposes the documented coefficients as the single source of truth", () => {
    expect(TEF_COEFFICIENTS.proteins).toBe(0.25);
    expect(TEF_COEFFICIENTS.carbs).toBe(0.075);
    expect(TEF_COEFFICIENTS.fats).toBe(0.025);
  });
});
