import { describe, expect, it } from "vitest";
import { estimateStrengthCalories, formatEstimatedKcal } from "./calories";

describe("estimateStrengthCalories", () => {
  it("returns null when there is no active time (no valid sets)", () => {
    expect(estimateStrengthCalories({ activeSeconds: 0, bodyWeightKg: 70 })).toBeNull();
    expect(estimateStrengthCalories({ activeSeconds: -5, bodyWeightKg: 70 })).toBeNull();
    expect(estimateStrengthCalories({ activeSeconds: NaN, bodyWeightKg: 70 })).toBeNull();
  });

  it("computes kcal from active time × fixed intense MET × body weight", () => {
    // MET intense (6.0) × 70 kg × 1h = 420 kcal
    expect(estimateStrengthCalories({ activeSeconds: 3600, bodyWeightKg: 70 })).toBe(420);
  });

  it("falls back to a conservative default body weight (70 kg) when none is provided", () => {
    const withoutWeight = estimateStrengthCalories({ activeSeconds: 3600, bodyWeightKg: null });
    const withDefaultWeight = estimateStrengthCalories({ activeSeconds: 3600, bodyWeightKg: 70 });
    expect(withoutWeight).toBe(withDefaultWeight);
  });

  it("uses the real body weight when available — never invents a 70 kg fallback if a real weight is given", () => {
    const light = estimateStrengthCalories({ activeSeconds: 1800, bodyWeightKg: 50 });
    const heavy = estimateStrengthCalories({ activeSeconds: 1800, bodyWeightKg: 100 });
    expect(light).toBeLessThan(heavy!);
    expect(heavy).toBe(Math.round(6.0 * 100 * 0.5));
  });

  it("never returns NaN for invalid weight", () => {
    const kcal = estimateStrengthCalories({ activeSeconds: 1800, bodyWeightKg: NaN });
    expect(kcal).not.toBeNull();
    expect(Number.isNaN(kcal)).toBe(false);
  });
});

describe("formatEstimatedKcal", () => {
  it("prefixes the value with ≈ to avoid a false impression of precision", () => {
    expect(formatEstimatedKcal(145)).toBe("≈145");
  });
});
