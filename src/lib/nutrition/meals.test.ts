import { describe, it, expect } from "vitest";
import { clampMacroSet, per100FromTotal, scalePer100 } from "./meals";

describe("per100FromTotal", () => {
  it("est l'inverse de scalePer100", () => {
    const per100 = 200;
    const grams = 150;
    const total = scalePer100(per100, grams)!;
    expect(per100FromTotal(total, grams)).toBeCloseTo(per100, 0);
  });

  it("calcule la valeur /100 g à partir d'un total mesuré", () => {
    // 165 kcal pour 150 g → 110 kcal/100 g
    expect(per100FromTotal(165, 150)).toBe(110);
  });

  it("retourne null si le total est null", () => {
    expect(per100FromTotal(null, 100)).toBeNull();
  });

  it("retourne null si grams est nul ou négatif", () => {
    expect(per100FromTotal(100, 0)).toBeNull();
    expect(per100FromTotal(100, -10)).toBeNull();
  });
});

describe("clampMacroSet", () => {
  it("n'inclut pas la clé fiber quand elle est absente de l'entrée", () => {
    const result = clampMacroSet({ calories: 100, proteins: 10, carbs: 10, fats: 5 });
    expect("fiber" in result).toBe(false);
  });

  it("borne fiber comme les autres macros quand elle est fournie", () => {
    const result = clampMacroSet({ calories: 100, proteins: 10, carbs: 10, fats: 5, fiber: 2500 });
    expect(result.fiber).toBe(1000);
  });

  it("préserve fiber: null explicite (distinct de l'absence de la clé)", () => {
    const result = clampMacroSet({ calories: 100, proteins: 10, carbs: 10, fats: 5, fiber: null });
    expect(result.fiber).toBeNull();
  });

  it("borne les 4 macros existantes sans régression", () => {
    const result = clampMacroSet({ calories: -5, proteins: 2000, carbs: -1, fats: NaN });
    expect(result).toEqual({ calories: 0, proteins: 1000, carbs: 0, fats: 0 });
  });
});
