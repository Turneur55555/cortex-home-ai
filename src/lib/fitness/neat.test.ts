import { describe, expect, it } from "vitest";
import { computeNEAT, estimateStepsCalories } from "./neat";

describe("computeNEAT — Niveau A (wearable active_calories)", () => {
  it("uses active_calories minus EAT when both are present and valid", () => {
    const result = computeNEAT({ activeCalories: 850, steps: 9000, weightKg: 70, eatKcal: 400 });
    expect(result).toEqual({
      kcal: 450,
      method: "wearable_active_calories",
      source: "wearable",
      confidence: "high",
    });
  });

  it("returns the full active_calories when EAT is 0 (no workout that day)", () => {
    const result = computeNEAT({ activeCalories: 500, steps: 6000, weightKg: 70, eatKcal: 0 });
    expect(result.kcal).toBe(500);
    expect(result.method).toBe("wearable_active_calories");
  });

  it("floors at 0 when EAT exceeds active_calories — never negative", () => {
    const result = computeNEAT({ activeCalories: 300, steps: 1000, weightKg: 70, eatKcal: 400 });
    expect(result.kcal).toBe(0);
    expect(result.kcal).toBeGreaterThanOrEqual(0);
  });

  it("never returns a negative NEAT even with a large EAT gap", () => {
    const result = computeNEAT({ activeCalories: 100, steps: 500, weightKg: 70, eatKcal: 2000 });
    expect(result.kcal).toBe(0);
  });
});

describe("computeNEAT — Niveau B (steps estimate)", () => {
  it("falls back to the steps-based estimate when active_calories is absent", () => {
    const result = computeNEAT({ activeCalories: null, steps: 8000, weightKg: 70, eatKcal: 200 });
    expect(result.method).toBe("steps_estimate");
    expect(result.source).toBe("computed");
    expect(result.confidence).toBe("medium");
    expect(result.kcal).toBeGreaterThan(0);
  });

  it("returns 0 kcal for 0 steps rather than insufficient data (0 is a real value)", () => {
    const estimate = estimateStepsCalories(0, 70, null);
    expect(estimate).toBe(0);
  });

  it("scales with a realistic step count", () => {
    const low = estimateStepsCalories(2000, 70, null)!;
    const high = estimateStepsCalories(12000, 70, null)!;
    expect(high).toBeGreaterThan(low);
  });

  it("scales with body weight", () => {
    const light = estimateStepsCalories(8000, 55, null)!;
    const heavy = estimateStepsCalories(8000, 95, null)!;
    expect(heavy).toBeGreaterThan(light);
  });

  it("refines the estimate when height is provided (stride length)", () => {
    const withoutHeight = estimateStepsCalories(8000, 70, null)!;
    const withHeight = estimateStepsCalories(8000, 70, 190)!;
    // Une personne plus grande a une foulée plus longue → distance/dépense plus élevée.
    expect(withHeight).toBeGreaterThan(withoutHeight);
  });

  it("returns null (never a fabricated estimate) when weight is missing", () => {
    expect(estimateStepsCalories(8000, null, null)).toBeNull();
    expect(estimateStepsCalories(8000, undefined, null)).toBeNull();
  });

  it("returns null when weight is 0 or invalid", () => {
    expect(estimateStepsCalories(8000, 0, null)).toBeNull();
    expect(estimateStepsCalories(8000, -70, null)).toBeNull();
  });

  it("handles partial data (steps present, height absent) via the average stride fallback", () => {
    const estimate = estimateStepsCalories(5000, 68, undefined);
    expect(estimate).not.toBeNull();
    expect(Number.isFinite(estimate)).toBe(true);
  });
});

describe("computeNEAT — priority (a single method wins, never combined)", () => {
  it("prefers wearable active_calories over steps when both are present", () => {
    const result = computeNEAT({ activeCalories: 600, steps: 9000, weightKg: 70, eatKcal: 100 });
    expect(result.method).toBe("wearable_active_calories");
  });

  it("uses steps only when active_calories is absent", () => {
    const result = computeNEAT({
      activeCalories: undefined,
      steps: 7000,
      weightKg: 70,
      eatKcal: 0,
    });
    expect(result.method).toBe("steps_estimate");
  });

  it("returns insufficient_data when neither active_calories nor steps/weight are usable", () => {
    const result = computeNEAT({ activeCalories: null, steps: null, weightKg: 70, eatKcal: 0 });
    expect(result).toEqual({
      kcal: null,
      method: "insufficient_data",
      source: "none",
      confidence: "insufficient",
    });
  });

  it("returns insufficient_data when steps exist but weight is unavailable (steps estimate impossible)", () => {
    const result = computeNEAT({ activeCalories: null, steps: 8000, weightKg: null, eatKcal: 0 });
    expect(result.method).toBe("insufficient_data");
    expect(result.kcal).toBeNull();
  });
});

describe("computeNEAT — robustness", () => {
  it("treats negative active_calories as absent, never propagating a negative value", () => {
    const result = computeNEAT({ activeCalories: -50, steps: 8000, weightKg: 70, eatKcal: 0 });
    // -50 est clampé à 0 par safeNonNegative, donc traité comme une vraie valeur 0 (Niveau A).
    expect(result.method).toBe("wearable_active_calories");
    expect(result.kcal).toBe(0);
  });

  it("never propagates NaN", () => {
    const result = computeNEAT({ activeCalories: NaN, steps: 8000, weightKg: 70, eatKcal: 0 });
    expect(result.method).toBe("steps_estimate");
    expect(Number.isNaN(result.kcal)).toBe(false);
  });

  it("never propagates Infinity — treats it as an absent value and falls back to the next level", () => {
    const withSteps = computeNEAT({
      activeCalories: Infinity,
      steps: 8000,
      weightKg: 70,
      eatKcal: 100,
    });
    expect(withSteps.method).toBe("steps_estimate");
    expect(Number.isFinite(withSteps.kcal)).toBe(true);

    const withoutFallback = computeNEAT({
      activeCalories: Infinity,
      steps: null,
      weightKg: null,
      eatKcal: 0,
    });
    expect(withoutFallback.method).toBe("insufficient_data");
  });

  it("clamps negative steps to zero rather than crashing", () => {
    const estimate = estimateStepsCalories(-500, 70, null);
    expect(estimate).toBe(0);
  });

  it("treats NaN steps as unusable data (null) rather than propagating NaN", () => {
    const estimate = estimateStepsCalories(NaN, 70, null);
    expect(estimate).toBeNull();
  });
});

describe("computeNEAT — per-date usage (no internal date coupling)", () => {
  it("is a pure function of whatever day's data the caller passes in", () => {
    const today = computeNEAT({ activeCalories: 700, steps: 9000, weightKg: 70, eatKcal: 200 });
    const otherDay = computeNEAT({ activeCalories: 400, steps: 4000, weightKg: 70, eatKcal: 0 });
    expect(today.kcal).not.toBe(otherDay.kcal);
  });

  it("returns insufficient_data for a date with no recorded activity at all", () => {
    const result = computeNEAT({
      activeCalories: undefined,
      steps: undefined,
      weightKg: 70,
      eatKcal: 0,
    });
    expect(result.method).toBe("insufficient_data");
  });
});
