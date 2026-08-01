import { describe, expect, it } from "vitest";
import {
  compareMacros,
  computeMacroStrategy,
  MACRO_STRATEGY_COEFFICIENTS,
  type MacroStrategyInput,
} from "./macroStrategy";

const base = (overrides: Partial<MacroStrategyInput>): MacroStrategyInput => ({
  calories: 2500,
  bodyWeightKg: 80,
  goal: "maintenance",
  ...overrides,
});

function macroCaloriesOf(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

describe("computeMacroStrategy — protéines", () => {
  it("fat_loss → apport protéique le plus élevé des 3 objectifs", () => {
    const fatLoss = computeMacroStrategy(base({ goal: "fat_loss" }));
    const maintenance = computeMacroStrategy(base({ goal: "maintenance" }));
    const muscleGain = computeMacroStrategy(base({ goal: "muscle_gain" }));
    expect(fatLoss.proteinsG!).toBeGreaterThan(maintenance.proteinsG!);
    expect(muscleGain.proteinsG!).toBeGreaterThan(maintenance.proteinsG!);
    expect(fatLoss.proteinsG!).toBeGreaterThanOrEqual(muscleGain.proteinsG!);
  });

  it("maintenance → apport protéique intermédiaire adapté au maintien", () => {
    const result = computeMacroStrategy(base({ goal: "maintenance" }));
    expect(result.proteinTargetGPerKg).toBe(
      MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG.maintenance,
    );
  });

  it("muscle_gain → apport suffisant pour l'hypertrophie", () => {
    const result = computeMacroStrategy(base({ goal: "muscle_gain" }));
    expect(result.proteinTargetGPerKg).toBe(
      MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG.muscle_gain,
    );
  });

  it("différents poids produisent des protéines différentes (relatif au poids)", () => {
    const light = computeMacroStrategy(base({ bodyWeightKg: 60 }));
    const heavy = computeMacroStrategy(base({ bodyWeightKg: 100 }));
    expect(heavy.proteinsG!).toBeGreaterThan(light.proteinsG!);
  });

  it("calories différentes avec le même poids → protéines stables (pas mécaniquement liées aux calories)", () => {
    const low = computeMacroStrategy(base({ calories: 2000 }));
    const high = computeMacroStrategy(base({ calories: 2500 }));
    // Exemple du brief : 2000→2500 kcal ne doit pas faire 150→188g de
    // protéines pour un même poids/objectif.
    expect(low.proteinsG).toBe(high.proteinsG);
  });

  it("poids très élevé — protéines plafonnées via BODYWEIGHT_CAP_KG, pas de valeur aberrante", () => {
    const result = computeMacroStrategy(base({ bodyWeightKg: 250, calories: 4000 }));
    const cappedExpected =
      MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG *
      MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG.maintenance;
    expect(result.proteinsG!).toBeLessThanOrEqual(cappedExpected + 5);
    expect(result.limited).toBe(true);
  });

  it("poids faible — protéines cohérentes, pas de plancher artificiel absurde", () => {
    const result = computeMacroStrategy(base({ bodyWeightKg: 45, calories: 1800 }));
    expect(result.proteinsG!).toBeGreaterThan(0);
    expect(result.proteinsG!).toBeLessThan(150);
  });

  it("données invalides (poids NaN) → aucune protéine fabriquée", () => {
    const result = computeMacroStrategy(base({ bodyWeightKg: Number.NaN }));
    expect(result.proteinsG).toBeNull();
    expect(result.limited).toBe(true);
  });
});

describe("computeMacroStrategy — lipides", () => {
  it("minimum respecté en enveloppe confortable", () => {
    const result = computeMacroStrategy(base({ calories: 3000, bodyWeightKg: 70 }));
    const floorFromWeight = 70 * MACRO_STRATEGY_COEFFICIENTS.FAT_G_PER_KG_MIN;
    expect(result.fatsG!).toBeGreaterThanOrEqual(floorFromWeight - 5);
  });

  it("différents poids → planchers lipides différents", () => {
    const light = computeMacroStrategy(base({ bodyWeightKg: 55, calories: 3000 }));
    const heavy = computeMacroStrategy(base({ bodyWeightKg: 95, calories: 3000 }));
    expect(heavy.fatsG!).toBeGreaterThan(light.fatsG!);
  });

  it("différents objectifs n'affectent pas directement le plancher lipides (basé sur poids/calories, pas l'objectif)", () => {
    const fatLoss = computeMacroStrategy(base({ goal: "fat_loss", calories: 3000 }));
    const muscleGain = computeMacroStrategy(base({ goal: "muscle_gain", calories: 3000 }));
    expect(fatLoss.fatTargetGPerKg).toBe(muscleGain.fatTargetGPerKg);
  });

  it("enveloppe calorique confortable — lipides à leur cible, jamais réduits", () => {
    const result = computeMacroStrategy(base({ calories: 3500, bodyWeightKg: 70 }));
    expect(result.limited).toBe(false);
  });

  it("enveloppe calorique contrainte — lipides réduits sous leur cible, signalé", () => {
    const result = computeMacroStrategy(
      base({ calories: 1300, bodyWeightKg: 100, goal: "fat_loss" }),
    );
    expect(result.limited).toBe(true);
    expect(result.limitReasons.some((r) => r.includes("Lipides"))).toBe(true);
  });
});

describe("computeMacroStrategy — glucides", () => {
  it("calcul du restant après protéines + lipides", () => {
    const result = computeMacroStrategy(base({ calories: 2500, bodyWeightKg: 80 }));
    const proteinCal = result.proteinsG! * 4;
    const fatCal = result.fatsG! * 9;
    const expectedCarbsApprox = (2500 - proteinCal - fatCal) / 4;
    expect(Math.abs(result.carbsG! - expectedCarbsApprox)).toBeLessThan(10);
  });

  it("jamais négatifs, même en enveloppe extrêmement faible", () => {
    const result = computeMacroStrategy(
      base({ calories: 900, bodyWeightKg: 90, goal: "fat_loss" }),
    );
    expect(result.carbsG!).toBeGreaterThanOrEqual(0);
  });

  it("enveloppe élevée → glucides généreux", () => {
    const result = computeMacroStrategy(
      base({ calories: 4000, bodyWeightKg: 75, goal: "muscle_gain" }),
    );
    expect(result.carbsG!).toBeGreaterThan(200);
  });

  it("enveloppe faible → glucides réduits voire nuls", () => {
    const result = computeMacroStrategy(
      base({ calories: 1200, bodyWeightKg: 100, goal: "fat_loss" }),
    );
    expect(result.carbsG!).toBeLessThan(50);
  });

  it("ajustement après arrondi reste cohérent (multiple de 5)", () => {
    const result = computeMacroStrategy(base({ calories: 2137, bodyWeightKg: 73 }));
    expect(result.carbsG! % 5).toBe(0);
    expect(result.proteinsG! % 5).toBe(0);
    expect(result.fatsG! % 5).toBe(0);
  });
});

describe("computeMacroStrategy — enveloppe calorique impossible (exemple du brief)", () => {
  it("protéines 200g + lipides 80g visés sur 1200 kcal (1520 kcal) → jamais de glucides négatifs", () => {
    // ~91 kg à 2.2 g/kg (fat_loss) ≈ 200g de protéines visées.
    const result = computeMacroStrategy(
      base({ calories: 1200, bodyWeightKg: 91, goal: "fat_loss" }),
    );
    expect(result.carbsG).not.toBeLessThan(0);
    expect(result.carbsG).toBe(0);
    expect(result.limited).toBe(true);
    expect(result.limitReasons.length).toBeGreaterThan(0);
  });

  it("cas extrême : même les protéines seules dépassent l'enveloppe", () => {
    const result = computeMacroStrategy(
      base({ calories: 500, bodyWeightKg: 90, goal: "fat_loss" }),
    );
    expect(result.fatsG).toBe(0);
    expect(result.carbsG).toBe(0);
    expect(result.limited).toBe(true);
    expect(result.limitReasons.some((r) => r.includes("extrême"))).toBe(true);
  });
});

describe("computeMacroStrategy — cohérence calorique", () => {
  it("P×4 + C×4 + L×9 reste dans la tolérance de l'objectif calorique", () => {
    const result = computeMacroStrategy(base({ calories: 2500, bodyWeightKg: 80 }));
    expect(result.macroCalories).toBe(
      macroCaloriesOf(result.proteinsG!, result.carbsG!, result.fatsG!),
    );
    expect(Math.abs(result.calorieDifference!)).toBeLessThanOrEqual(
      MACRO_STRATEGY_COEFFICIENTS.CALORIE_TOLERANCE_KCAL,
    );
  });

  it("l'écart n'est jamais caché, même après le nudge de tolérance", () => {
    const result = computeMacroStrategy(base({ calories: 2517, bodyWeightKg: 73 }));
    expect(result.calorieDifference).not.toBeNull();
    expect(typeof result.calorieDifference).toBe("number");
  });
});

describe("computeMacroStrategy — changement de calories à poids/objectif identiques", () => {
  it("protéines stables, lipides suivent la stratégie, l'écart absorbé par les glucides", () => {
    const low = computeMacroStrategy(
      base({ calories: 2000, bodyWeightKg: 80, goal: "maintenance" }),
    );
    const high = computeMacroStrategy(
      base({ calories: 2500, bodyWeightKg: 80, goal: "maintenance" }),
    );
    expect(low.proteinsG).toBe(high.proteinsG);
    // Les lipides peuvent augmenter légèrement si le plancher % calories
    // dépasse le plancher g/kg à haute enveloppe, mais jamais de façon
    // disproportionnée par rapport aux glucides.
    const carbsDelta = high.carbsG! - low.carbsG!;
    const fatDelta = high.fatsG! - low.fatsG!;
    expect(carbsDelta).toBeGreaterThan(0);
    expect(carbsDelta).toBeGreaterThan(fatDelta);
  });
});

describe("computeMacroStrategy — comparaison", () => {
  it("macros actuelles inférieures à la recommandation", () => {
    const rec = computeMacroStrategy(base({}));
    const cmp = compareMacros({ proteins: 100, carbs: 150, fats: 40 }, rec);
    expect(cmp.proteins.differenceG!).toBeGreaterThan(0);
  });

  it("macros actuelles supérieures à la recommandation", () => {
    const rec = computeMacroStrategy(base({}));
    const cmp = compareMacros(
      { proteins: rec.proteinsG! + 50, carbs: rec.carbsG! + 50, fats: rec.fatsG! + 50 },
      rec,
    );
    expect(cmp.proteins.differenceG!).toBeLessThan(0);
  });

  it("macros actuelles identiques à la recommandation", () => {
    const rec = computeMacroStrategy(base({}));
    const cmp = compareMacros({ proteins: rec.proteinsG, carbs: rec.carbsG, fats: rec.fatsG }, rec);
    expect(cmp.proteins.differenceG).toBe(0);
    expect(cmp.carbs.differenceG).toBe(0);
    expect(cmp.fats.differenceG).toBe(0);
  });

  it("macros actuelles absentes → differenceG null, recommended toujours exposé", () => {
    const rec = computeMacroStrategy(base({}));
    const cmp = compareMacros({ proteins: null, carbs: null, fats: null }, rec);
    expect(cmp.proteins.differenceG).toBeNull();
    expect(cmp.proteins.recommended).toBe(rec.proteinsG);
  });
});

describe("computeMacroStrategy — robustesse", () => {
  it("NaN dans les calories → non exploitable", () => {
    const result = computeMacroStrategy(base({ calories: Number.NaN }));
    expect(result.proteinsG).toBeNull();
    expect(result.limited).toBe(true);
  });

  it("Infinity dans le poids → non exploitable", () => {
    const result = computeMacroStrategy(base({ bodyWeightKg: Number.POSITIVE_INFINITY }));
    expect(result.proteinsG).toBeNull();
  });

  it("valeurs négatives → non exploitables", () => {
    expect(computeMacroStrategy(base({ calories: -500 })).proteinsG).toBeNull();
    expect(computeMacroStrategy(base({ bodyWeightKg: -70 })).proteinsG).toBeNull();
  });

  it("calories nulles (0) → non exploitables", () => {
    const result = computeMacroStrategy(base({ calories: 0 }));
    expect(result.proteinsG).toBeNull();
    expect(result.limitReasons[0]).toMatch(/calorique/i);
  });

  it("poids nul (0) → non exploitable", () => {
    const result = computeMacroStrategy(base({ bodyWeightKg: 0 }));
    expect(result.proteinsG).toBeNull();
    expect(result.limitReasons[0]).toMatch(/poids/i);
  });

  it("objectif invalide → non exploitable", () => {
    const result = computeMacroStrategy(
      base({ goal: "bulk" as unknown as MacroStrategyInput["goal"] }),
    );
    expect(result.proteinsG).toBeNull();
    expect(result.limited).toBe(true);
  });

  it("enveloppe calorique très faible ne plante pas et reste non négative", () => {
    expect(() => computeMacroStrategy(base({ calories: 200, bodyWeightKg: 90 }))).not.toThrow();
    const result = computeMacroStrategy(base({ calories: 200, bodyWeightKg: 90 }));
    expect(result.proteinsG!).toBeGreaterThanOrEqual(0);
    expect(result.fatsG!).toBeGreaterThanOrEqual(0);
    expect(result.carbsG!).toBeGreaterThanOrEqual(0);
  });

  it("enveloppe calorique très forte ne plante pas", () => {
    expect(() => computeMacroStrategy(base({ calories: 8000, bodyWeightKg: 110 }))).not.toThrow();
    const result = computeMacroStrategy(base({ calories: 8000, bodyWeightKg: 110 }));
    expect(result.limited).toBe(false);
  });
});

describe("computeMacroStrategy — autonomie Cortex-native", () => {
  it("fonctionne uniquement à partir de calories/poids/objectif Cortex, sans source externe", () => {
    const result = computeMacroStrategy(base({}));
    expect(result.proteinsG).not.toBeNull();
    expect(result.carbsG).not.toBeNull();
    expect(result.fatsG).not.toBeNull();
  });
});

describe("computeMacroStrategy — simulation d'une autre enveloppe calorique", () => {
  it("appeler la même fonction avec des calories hypothétiques simule une autre enveloppe (§2 du brief)", () => {
    const active = computeMacroStrategy(base({ calories: 2200 }));
    const simulated = computeMacroStrategy(base({ calories: 2600 }));
    expect(simulated.calorieTarget).toBe(2600);
    expect(active.calorieTarget).toBe(2200);
    expect(simulated.carbsG).not.toBe(active.carbsG);
  });
});
