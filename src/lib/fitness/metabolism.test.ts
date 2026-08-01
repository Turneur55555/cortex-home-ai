import { describe, expect, it } from "vitest";
import {
  bmiCategory,
  computeBMI,
  computeBMR,
  computeCalorieTarget,
  computeTDEE,
  isBiologicalSex,
  isValidMetabolicAge,
} from "./metabolism";

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

  it("returns null when weight or height is missing (incomplete body data)", () => {
    expect(computeBMR("homme", 30, NaN, 180)).toBeNull();
    expect(computeBMR("femme", 30, 65, NaN)).toBeNull();
  });
});

describe("isBiologicalSex", () => {
  it("accepts only the two known values", () => {
    expect(isBiologicalSex("homme")).toBe(true);
    expect(isBiologicalSex("femme")).toBe(true);
  });

  it("rejects anything else, including null and unexpected strings", () => {
    expect(isBiologicalSex(null)).toBe(false);
    expect(isBiologicalSex(undefined)).toBe(false);
    expect(isBiologicalSex("")).toBe(false);
    expect(isBiologicalSex("autre")).toBe(false);
    expect(isBiologicalSex(1)).toBe(false);
  });
});

describe("isValidMetabolicAge", () => {
  it("accepts integers strictly between 0 and 130", () => {
    expect(isValidMetabolicAge(1)).toBe(true);
    expect(isValidMetabolicAge(30)).toBe(true);
    expect(isValidMetabolicAge(129)).toBe(true);
  });

  it("rejects zero, negative, non-integer, and out-of-range values", () => {
    expect(isValidMetabolicAge(0)).toBe(false);
    expect(isValidMetabolicAge(-1)).toBe(false);
    expect(isValidMetabolicAge(130)).toBe(false);
    expect(isValidMetabolicAge(200)).toBe(false);
    expect(isValidMetabolicAge(30.5)).toBe(false);
    expect(isValidMetabolicAge(NaN)).toBe(false);
  });
});

describe("computeTDEE", () => {
  it("scales BMR by activity level only — no goal adjustment", () => {
    expect(computeTDEE(1780, 1.55)).toBe(2759);
  });
});

describe("computeCalorieTarget", () => {
  it("applies a goal delta on top of the TDEE", () => {
    expect(computeCalorieTarget(2759)).toBe(2759);
    expect(computeCalorieTarget(2759, -300)).toBe(2459);
    expect(computeCalorieTarget(2759, 300)).toBe(3059);
  });

  it("never returns below the 1200 kcal floor", () => {
    expect(computeCalorieTarget(800, -1000)).toBe(1200);
  });
});

describe("metabolic profile → BMR composition (sante-nutritionnelle.tsx logic)", () => {
  type Profile = { sex: string | null; age: number | null } | null;

  function resolveBMR(profile: Profile, weightKg: number | null, heightCm: number | null) {
    const sex = profile && isBiologicalSex(profile.sex) ? profile.sex : null;
    const age = profile?.age ?? null;
    if (sex == null || age == null || weightKg == null || heightCm == null) return null;
    return computeBMR(sex, age, weightKg, heightCm);
  }

  it("returns null when the metabolic profile is missing", () => {
    expect(resolveBMR(null, 80, 180)).toBeNull();
  });

  it("returns null when age is missing even with a valid sex", () => {
    expect(resolveBMR({ sex: "homme", age: null }, 80, 180)).toBeNull();
  });

  it("returns null when body data (weight/height) is missing, even with a complete profile", () => {
    expect(resolveBMR({ sex: "homme", age: 30 }, null, 180)).toBeNull();
    expect(resolveBMR({ sex: "homme", age: 30 }, 80, null)).toBeNull();
  });

  it("computes the BMR once profile and body data are both available", () => {
    expect(resolveBMR({ sex: "homme", age: 30 }, 80, 180)).toBe(1780);
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
