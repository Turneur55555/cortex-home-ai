import { describe, expect, it } from "vitest";
import {
  computeNEAT,
  estimateNeatFromActivityLevel,
  estimateStepsCalories,
  isNeatActivityLevel,
  NEAT_ACTIVITY_LEVELS,
} from "./neat";

describe("NEAT_ACTIVITY_LEVELS / isNeatActivityLevel", () => {
  it("exposes exactly the four documented levels", () => {
    expect(NEAT_ACTIVITY_LEVELS.map((l) => l.value)).toEqual([0.15, 0.25, 0.35, 0.5]);
    expect(NEAT_ACTIVITY_LEVELS.map((l) => l.label)).toEqual([
      "Très sédentaire",
      "Peu actif",
      "Actif",
      "Très actif",
    ]);
  });

  it("rejects classic TDEE multipliers (1.2/1.375/1.55/1.725/1.9) — never reused blindly", () => {
    for (const classic of [1.2, 1.375, 1.55, 1.725, 1.9]) {
      expect(isNeatActivityLevel(classic)).toBe(false);
    }
  });

  it("accepts only the four known NEAT-specific values", () => {
    expect(isNeatActivityLevel(0.15)).toBe(true);
    expect(isNeatActivityLevel(0.5)).toBe(true);
    expect(isNeatActivityLevel(0.3)).toBe(false);
    expect(isNeatActivityLevel(null)).toBe(false);
    expect(isNeatActivityLevel(undefined)).toBe(false);
  });
});

describe("estimateNeatFromActivityLevel — Cortex-native (no external data)", () => {
  const BMR = 1700;

  it("computes NEAT for the très sédentaire level", () => {
    expect(estimateNeatFromActivityLevel(BMR, 0.15)).toBe(Math.round(BMR * 0.15));
  });

  it("computes NEAT for the peu actif level", () => {
    expect(estimateNeatFromActivityLevel(BMR, 0.25)).toBe(Math.round(BMR * 0.25));
  });

  it("computes NEAT for the actif level", () => {
    expect(estimateNeatFromActivityLevel(BMR, 0.35)).toBe(Math.round(BMR * 0.35));
  });

  it("computes NEAT for the très actif level", () => {
    expect(estimateNeatFromActivityLevel(BMR, 0.5)).toBe(Math.round(BMR * 0.5));
  });

  it("increases with a higher activity level for the same BMR", () => {
    const values = NEAT_ACTIVITY_LEVELS.map((l) => estimateNeatFromActivityLevel(BMR, l.value)!);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("updates when BMR changes (weight/age/sex indirectly)", () => {
    const lowerBmr = estimateNeatFromActivityLevel(1500, 0.25)!;
    const higherBmr = estimateNeatFromActivityLevel(1900, 0.25)!;
    expect(higherBmr).toBeGreaterThan(lowerBmr);
  });

  it("returns null when the activity level hasn't been declared", () => {
    expect(estimateNeatFromActivityLevel(BMR, null)).toBeNull();
    expect(estimateNeatFromActivityLevel(BMR, undefined)).toBeNull();
  });

  it("returns null for a classic TDEE multiplier — never reused as a NEAT level", () => {
    expect(estimateNeatFromActivityLevel(BMR, 1.55)).toBeNull();
  });

  it("returns null when BMR is missing or invalid", () => {
    expect(estimateNeatFromActivityLevel(null, 0.25)).toBeNull();
    expect(estimateNeatFromActivityLevel(0, 0.25)).toBeNull();
    expect(estimateNeatFromActivityLevel(NaN, 0.25)).toBeNull();
    expect(estimateNeatFromActivityLevel(-100, 0.25)).toBeNull();
  });
});

describe("computeNEAT — Cortex-native is the primary method (no external service required)", () => {
  it("computes NEAT from a complete Cortex profile with zero Apple Health / wearable data", () => {
    const result = computeNEAT({
      bmr: 1700,
      activityLevel: 0.25,
      activeCalories: undefined,
      steps: undefined,
      weightKg: undefined,
      eatKcal: undefined,
    });
    expect(result.method).toBe("cortex_native");
    expect(result.source).toBe("profile");
    expect(result.confidence).toBe("medium");
    expect(result.kcal).toBe(Math.round(1700 * 0.25));
  });

  it("computes NEAT even when daily_activity has no row at all for the day", () => {
    const result = computeNEAT({ bmr: 1700, activityLevel: 0.35 });
    expect(result.kcal).not.toBeNull();
    expect(result.method).toBe("cortex_native");
  });

  it("is entirely unaffected by EAT — no workout logged today", () => {
    const noWorkout = computeNEAT({ bmr: 1700, activityLevel: 0.25, eatKcal: 0 });
    expect(noWorkout.method).toBe("cortex_native");
    expect(noWorkout.kcal).toBe(Math.round(1700 * 0.25));
  });

  it("is entirely unaffected by EAT — several workouts logged today", () => {
    const withWorkouts = computeNEAT({ bmr: 1700, activityLevel: 0.25, eatKcal: 850 });
    expect(withWorkouts.method).toBe("cortex_native");
    expect(withWorkouts.kcal).toBe(Math.round(1700 * 0.25));
  });

  it("returns the exact same NEAT regardless of how much EAT is passed", () => {
    const none = computeNEAT({ bmr: 1700, activityLevel: 0.35, eatKcal: 0 });
    const some = computeNEAT({ bmr: 1700, activityLevel: 0.35, eatKcal: 300 });
    const lots = computeNEAT({ bmr: 1700, activityLevel: 0.35, eatKcal: 1500 });
    expect(none.kcal).toBe(some.kcal);
    expect(some.kcal).toBe(lots.kcal);
  });

  it("takes priority over wearable data even when both are present", () => {
    const result = computeNEAT({
      bmr: 1700,
      activityLevel: 0.25,
      activeCalories: 900,
      eatKcal: 200,
    });
    expect(result.method).toBe("cortex_native");
  });
});

describe("computeNEAT — Niveau A (wearable active_calories, optional fallback)", () => {
  it("uses active_calories minus EAT when the Cortex-native profile isn't set up", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: 850,
      eatKcal: 400,
    });
    expect(result).toEqual({
      kcal: 450,
      method: "wearable_active_calories",
      source: "wearable",
      confidence: "high",
    });
  });

  it("returns the full active_calories when EAT is 0", () => {
    const result = computeNEAT({ bmr: null, activityLevel: null, activeCalories: 500, eatKcal: 0 });
    expect(result.kcal).toBe(500);
  });

  it("floors at 0 when EAT exceeds active_calories — never negative", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: 300,
      eatKcal: 400,
    });
    expect(result.kcal).toBe(0);
  });

  it("never returns a negative NEAT even with a large EAT gap", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: 100,
      eatKcal: 2000,
    });
    expect(result.kcal).toBe(0);
  });
});

describe("computeNEAT — Niveau B (steps estimate, optional fallback)", () => {
  it("falls back to the steps-based estimate when neither profile nor active_calories are usable", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: null,
      steps: 8000,
      weightKg: 70,
      eatKcal: 200,
    });
    expect(result.method).toBe("steps_estimate");
    expect(result.source).toBe("computed");
    expect(result.confidence).toBe("medium");
    expect(result.kcal).toBeGreaterThan(0);
  });

  it("returns 0 kcal for 0 steps rather than insufficient data (0 is a real value)", () => {
    expect(estimateStepsCalories(0, 70, null)).toBe(0);
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
  it("prefers Cortex-native over wearable and steps when the profile is complete", () => {
    const result = computeNEAT({
      bmr: 1700,
      activityLevel: 0.25,
      activeCalories: 600,
      steps: 9000,
      weightKg: 70,
      eatKcal: 100,
    });
    expect(result.method).toBe("cortex_native");
  });

  it("prefers wearable active_calories over steps when Cortex-native is unavailable", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: 600,
      steps: 9000,
      weightKg: 70,
      eatKcal: 100,
    });
    expect(result.method).toBe("wearable_active_calories");
  });

  it("uses steps only when neither Cortex-native nor active_calories are usable", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: undefined,
      steps: 7000,
      weightKg: 70,
      eatKcal: 0,
    });
    expect(result.method).toBe("steps_estimate");
  });

  it("returns insufficient_data when nothing at all is usable", () => {
    const result = computeNEAT({ bmr: null, activityLevel: null, steps: null, weightKg: 70 });
    expect(result).toEqual({
      kcal: null,
      method: "insufficient_data",
      source: "none",
      confidence: "insufficient",
    });
  });
});

describe("computeNEAT — robustness (impossible values)", () => {
  it("treats negative active_calories as a real zero once Cortex-native is unavailable", () => {
    const result = computeNEAT({ bmr: null, activityLevel: null, activeCalories: -50, eatKcal: 0 });
    expect(result.method).toBe("wearable_active_calories");
    expect(result.kcal).toBe(0);
  });

  it("never propagates NaN from active_calories — falls back to the next level", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: NaN,
      steps: 8000,
      weightKg: 70,
      eatKcal: 0,
    });
    expect(result.method).toBe("steps_estimate");
    expect(Number.isNaN(result.kcal)).toBe(false);
  });

  it("never propagates Infinity from active_calories — falls back to the next level", () => {
    const result = computeNEAT({
      bmr: null,
      activityLevel: null,
      activeCalories: Infinity,
      steps: 8000,
      weightKg: 70,
      eatKcal: 100,
    });
    expect(result.method).toBe("steps_estimate");
    expect(Number.isFinite(result.kcal)).toBe(true);
  });

  it("clamps negative steps to zero rather than crashing", () => {
    expect(estimateStepsCalories(-500, 70, null)).toBe(0);
  });

  it("treats NaN/negative weight and BMR as unusable rather than propagating garbage", () => {
    expect(estimateNeatFromActivityLevel(NaN, 0.25)).toBeNull();
    expect(computeNEAT({ bmr: NaN, activityLevel: 0.25 }).method).toBe("insufficient_data");
    expect(estimateStepsCalories(8000, NaN, null)).toBeNull();
  });
});

describe("computeNEAT — Apple Health independence (hard requirement)", () => {
  it("works with a fully filled Cortex profile and zero external service connected", () => {
    const result = computeNEAT({
      bmr: 1650,
      activityLevel: 0.35,
      activeCalories: undefined,
      steps: undefined,
      weightKg: undefined,
      heightCm: undefined,
      eatKcal: undefined,
    });
    expect(result.kcal).not.toBeNull();
    expect(result.method).toBe("cortex_native");
    expect(result.source).toBe("profile");
  });

  it("still returns insufficient_data (never a fabricated value) if the profile is also incomplete and no wearable data exists", () => {
    const result = computeNEAT({ bmr: null, activityLevel: null });
    expect(result.kcal).toBeNull();
    expect(result.method).toBe("insufficient_data");
  });
});
