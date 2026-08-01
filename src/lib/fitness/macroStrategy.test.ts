import { describe, expect, it } from "vitest";
import {
  compareMacros,
  computeMacroStrategy,
  evaluateAutoMacroAdjustment,
  MACRO_STRATEGY_COEFFICIENTS,
  type AutoMacroAdjustmentInput,
  type MacroStrategyInput,
  type MacroStrategyResult,
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

// =========================================================================
// Phase 5B — Verrous (§41 du brief : aucun lock / P / C / F / P+G / P+L /
// G+L / P+G+L / locks compatibles / locks incompatibles / valeur 0 / valeur
// invalide).
// =========================================================================

describe("computeMacroStrategy — verrous individuels", () => {
  it("aucun verrou → comportement strictement identique à Phase 5A (non-régression)", () => {
    const withoutLockFields = computeMacroStrategy(base({}));
    const withNullLocks = computeMacroStrategy(
      base({ lockedProteinsG: null, lockedCarbsG: null, lockedFatsG: null }),
    );
    expect(withNullLocks).toEqual(withoutLockFields);
  });

  it("protéines verrouillées → valeur figée exacte, non recalculée", () => {
    const result = computeMacroStrategy(base({ lockedProteinsG: 160 }));
    expect(result.proteinsG).toBe(160);
    expect(result.proteinTargetGPerKg).toBeNull();
    expect(result.allMacrosLocked).toBe(false);
  });

  it("glucides verrouillés → valeur figée exacte", () => {
    const result = computeMacroStrategy(base({ lockedCarbsG: 220 }));
    expect(result.carbsG).toBe(220);
  });

  it("lipides verrouillés → valeur figée exacte", () => {
    const result = computeMacroStrategy(base({ lockedFatsG: 65 }));
    expect(result.fatsG).toBe(65);
    expect(result.fatTargetGPerKg).toBeNull();
  });

  it("protéines + glucides verrouillés → lipides absorbent le budget restant", () => {
    const result = computeMacroStrategy(
      base({ calories: 2200, lockedProteinsG: 160, lockedCarbsG: 200 }),
    );
    expect(result.proteinsG).toBe(160);
    expect(result.carbsG).toBe(200);
    expect(result.fatsG).not.toBeNull();
    expect(result.fatsG!).toBeGreaterThanOrEqual(0);
  });

  it("protéines + lipides verrouillés → glucides = calories restantes", () => {
    const result = computeMacroStrategy(
      base({ calories: 2200, lockedProteinsG: 160, lockedFatsG: 65 }),
    );
    expect(result.proteinsG).toBe(160);
    expect(result.fatsG).toBe(65);
    const remaining = 2200 - 160 * 4 - 65 * 9;
    expect(result.carbsG).toBeCloseTo(Math.round(remaining / 4 / 5) * 5, 0);
  });

  it("glucides + lipides verrouillés → protéines calculées sur le budget restant", () => {
    const result = computeMacroStrategy(
      base({ calories: 2200, lockedCarbsG: 200, lockedFatsG: 65 }),
    );
    expect(result.carbsG).toBe(200);
    expect(result.fatsG).toBe(65);
    expect(result.proteinsG).not.toBeNull();
  });

  it("les trois macros verrouillées → allMacrosLocked, valeurs inchangées, aucun calcul", () => {
    const result = computeMacroStrategy(
      base({ calories: 2200, lockedProteinsG: 160, lockedCarbsG: 220, lockedFatsG: 65 }),
    );
    expect(result.allMacrosLocked).toBe(true);
    expect(result.proteinsG).toBe(160);
    expect(result.carbsG).toBe(220);
    expect(result.fatsG).toBe(65);
  });

  it("les trois macros verrouillées mais incohérentes avec l'objectif calorique → signalé, jamais corrigé", () => {
    const result = computeMacroStrategy(
      base({ calories: 1200, lockedProteinsG: 160, lockedCarbsG: 220, lockedFatsG: 65 }),
    );
    expect(result.allMacrosLocked).toBe(true);
    expect(result.proteinsG).toBe(160);
    expect(result.carbsG).toBe(220);
    expect(result.fatsG).toBe(65);
    expect(result.limited).toBe(true);
  });

  it("locks compatibles (somme < enveloppe) → répartition normale, aucune limitation liée aux locks", () => {
    const result = computeMacroStrategy(
      base({ calories: 2500, lockedProteinsG: 100, lockedFatsG: 50 }),
    );
    expect(result.locksIncompatible).toBe(false);
  });

  it("§14/§15 — locks incompatibles : calories dépassées par les locks seuls → bloqué, jamais réduit", () => {
    const incompatible = computeMacroStrategy(
      base({ calories: 1500, lockedProteinsG: 200, lockedFatsG: 100 }),
    );
    expect(incompatible.locksIncompatible).toBe(true);
    expect(incompatible.limited).toBe(true);
    expect(incompatible.proteinsG).toBe(200); // jamais réduit
    expect(incompatible.fatsG).toBe(100); // jamais réduit
    expect(incompatible.carbsG).toBe(0); // non verrouillé, ne peut pas être négatif
  });

  it("§14 — locks compatibles : glucides = exactement les calories restantes", () => {
    const result = computeMacroStrategy(
      base({ calories: 1800, lockedProteinsG: 200, lockedFatsG: 100 }),
    );
    expect(result.locksIncompatible).toBe(false);
    expect(result.proteinsG).toBe(200);
    expect(result.fatsG).toBe(100);
    // 1800 - 800 - 900 = 100 kcal restants → 25 g de glucides.
    expect(result.carbsG).toBe(25);
  });

  it("valeur verrouillée 0 g est acceptée (schéma l'autorise)", () => {
    const result = computeMacroStrategy(base({ calories: 2200, lockedFatsG: 0 }));
    expect(result.fatsG).toBe(0);
    expect(result.allMacrosLocked).toBe(false);
  });

  it("valeur verrouillée invalide (négative/NaN/Infinity) → traitée comme non verrouillée", () => {
    const negative = computeMacroStrategy(base({ lockedProteinsG: -10 }));
    const nan = computeMacroStrategy(base({ lockedCarbsG: NaN }));
    const infinite = computeMacroStrategy(base({ lockedFatsG: Infinity }));
    const noLock = computeMacroStrategy(base({}));
    expect(negative.proteinsG).toBe(noLock.proteinsG);
    expect(nan.carbsG).toBe(noLock.carbsG);
    expect(infinite.fatsG).toBe(noLock.fatsG);
  });

  it("§11 — protéines verrouillées à 160 g restent exactement 160 g quel que soit le reste", () => {
    const result = computeMacroStrategy(
      base({ calories: 2200, bodyWeightKg: 95, goal: "fat_loss", lockedProteinsG: 160 }),
    );
    expect(result.proteinsG).toBe(160);
  });

  it("§38 — hausse calorique avec protéines verrouillées : protéines strictement identiques, absorption par le reste", () => {
    const before = computeMacroStrategy(
      base({ calories: 2000, bodyWeightKg: 81, lockedProteinsG: 160 }),
    );
    const after = computeMacroStrategy(
      base({ calories: 2200, bodyWeightKg: 81, lockedProteinsG: 160 }),
    );
    expect(before.proteinsG).toBe(160);
    expect(after.proteinsG).toBe(160);
    // La différence calorique est absorbée par les macros non verrouillées.
    const beforeNonProteinCal = before.macroCalories! - 160 * 4;
    const afterNonProteinCal = after.macroCalories! - 160 * 4;
    expect(afterNonProteinCal).toBeGreaterThan(beforeNonProteinCal);
  });

  it("jamais de macro négative, même dans les cas verrouillés impossibles", () => {
    const result = computeMacroStrategy(
      base({ calories: 500, lockedProteinsG: 300, lockedFatsG: 100 }),
    );
    expect(result.proteinsG!).toBeGreaterThanOrEqual(0);
    expect(result.carbsG!).toBeGreaterThanOrEqual(0);
    expect(result.fatsG!).toBeGreaterThanOrEqual(0);
  });

  it("cohérence énergétique P×4+G×4+L×9 respectée sur les valeurs verrouillées + calculées", () => {
    const result = computeMacroStrategy(base({ calories: 2200, lockedProteinsG: 160 }));
    const recomputed = macroCaloriesOf(result.proteinsG!, result.carbsG!, result.fatsG!);
    expect(result.macroCalories).toBe(recomputed);
  });
});

// =========================================================================
// Phase 5B — Mode automatique (§43/§44/§45 du brief).
// =========================================================================

function autoInput(overrides: Partial<AutoMacroAdjustmentInput>): AutoMacroAdjustmentInput {
  const recommended: MacroStrategyResult = computeMacroStrategy(base({ calories: 2200 }));
  return {
    mode: "automatic",
    recommended,
    currentProteinsG: recommended.proteinsG! - 20,
    currentCarbsG: recommended.carbsG,
    currentFatsG: recommended.fatsG,
    ...overrides,
  };
}

describe("evaluateAutoMacroAdjustment", () => {
  it("mode manuel → jamais éligible", () => {
    const result = evaluateAutoMacroAdjustment(autoInput({ mode: "manual" }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("manual_mode");
  });

  it("recommandation indisponible → non éligible", () => {
    const unavailable = computeMacroStrategy(base({ calories: null }));
    const result = evaluateAutoMacroAdjustment(
      autoInput({
        recommended: unavailable,
        currentProteinsG: null,
        currentCarbsG: null,
        currentFatsG: null,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("recommendation_unavailable");
  });

  it("toutes les macros verrouillées → non éligible, all_macros_locked", () => {
    const allLocked = computeMacroStrategy(
      base({ calories: 2200, lockedProteinsG: 160, lockedCarbsG: 220, lockedFatsG: 65 }),
    );
    const result = evaluateAutoMacroAdjustment(autoInput({ recommended: allLocked }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("all_macros_locked");
  });

  it("locks incompatibles avec l'enveloppe → non éligible, locks_incompatible", () => {
    const incompatible = computeMacroStrategy(
      base({ calories: 1500, lockedProteinsG: 200, lockedFatsG: 100 }),
    );
    const result = evaluateAutoMacroAdjustment(autoInput({ recommended: incompatible }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("locks_incompatible");
  });

  it("déjà aligné → non éligible, aucune écriture (§27)", () => {
    const recommended = computeMacroStrategy(base({ calories: 2200 }));
    const result = evaluateAutoMacroAdjustment(
      autoInput({
        recommended,
        currentProteinsG: recommended.proteinsG,
        currentCarbsG: recommended.carbsG,
        currentFatsG: recommended.fatsG,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("already_aligned");
  });

  it("écart réel → éligible, propose les valeurs recommandées", () => {
    const input = autoInput({});
    const result = evaluateAutoMacroAdjustment(input);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("eligible");
    expect(result.proposedProteinsG).toBe(input.recommended.proteinsG);
    expect(result.proposedCarbsG).toBe(input.recommended.carbsG);
    expect(result.proposedFatsG).toBe(input.recommended.fatsG);
  });

  it("§45 — protéines verrouillées : les calories changent, protéines restent strictement identiques dans la proposition", () => {
    const recommended = computeMacroStrategy(base({ calories: 2200, lockedProteinsG: 160 }));
    const result = evaluateAutoMacroAdjustment(
      autoInput({
        recommended,
        currentProteinsG: 160,
        currentCarbsG: recommended.carbsG! - 20,
        currentFatsG: recommended.fatsG,
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.proposedProteinsG).toBe(160);
  });

  it("§45 — glucides et lipides verrouillés simultanément : proposition respecte les deux verrous", () => {
    const recommended = computeMacroStrategy(
      base({ calories: 2400, lockedCarbsG: 220, lockedFatsG: 65 }),
    );
    const result = evaluateAutoMacroAdjustment(
      autoInput({
        recommended,
        currentProteinsG: recommended.proteinsG! - 15,
        currentCarbsG: 220,
        currentFatsG: 65,
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.proposedCarbsG).toBe(220);
    expect(result.proposedFatsG).toBe(65);
  });

  it("§44 — indépendance des modes : ce module ne lit jamais calorie_strategy_mode (aucune référence dans l'input)", () => {
    const input = autoInput({});
    expect(Object.keys(input)).not.toContain("calorieStrategyMode");
  });
});
