import { describe, expect, it } from "vitest";
import { bmiCategory, computeBMI, computeBMR, computeTDEE } from "./metabolism";

describe("computeBMR", () => {
  it("computes Mifflin-St Jeor BMR for a man", () => {
    expect(computeBMR("homme", 30, 80, 180)).toBe(1780);
  });

  it("computes Mifflin-St Jeor BMR for a woman", () => {
    expect(computeBMR("femme", 30, 65, 165)).toBe(1370);
  });

  it("returns null for invalid inputs", () => {
    expect(computeBMR("homme", 0, 80, 180)).toBeNull();
    expect(computeBMR("homme", 30, -1, 180)).toBeNull();
    expect(computeBMR("homme", 30, 80, NaN)).toBeNull();
  });
});

describe("computeTDEE", () => {
  it("scales BMR by activity level and applies a goal delta", () => {
    expect(computeTDEE(1780, 1.55)).toBe(2759);
    expect(computeTDEE(1780, 1.55, -300)).toBe(2459);
  });

  it("never returns below the 1200 kcal floor", () => {
    expect(computeTDEE(800, 1, -1000)).toBe(1200);
  });
});

describe("computeBMI / bmiCategory", () => {
  it("computes BMI from weight and height", () => {
    expect(computeBMI(70, 175)).toBe(22.9);
  });

  it("returns null for invalid inputs", () => {
    expect(computeBMI(0, 175)).toBeNull();
    expect(computeBMI(70, 0)).toBeNull();
  });

  it("categorizes BMI per WHO thresholds", () => {
    expect(bmiCategory(17)).toBe("insuffisance");
    expect(bmiCategory(22)).toBe("normal");
    expect(bmiCategory(27)).toBe("surpoids");
    expect(bmiCategory(32)).toBe("obesite");
  });
});
