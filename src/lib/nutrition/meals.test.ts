import { describe, it, expect } from "vitest";
import { per100FromTotal, scalePer100 } from "./meals";

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
