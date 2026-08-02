import { describe, expect, it } from "vitest";
import { MACRO_STRATEGY_COEFFICIENTS } from "./macroStrategy";
import {
  BODY_COMPOSITION_MAX_AGE_DAYS,
  computeLeanMassProteinTargetG,
  LEAN_MASS_PROTEIN_G_PER_KG,
  selectBodyCompositionForNutrition,
  type BodyCompositionCandidate,
} from "./bodyCompositionForNutrition";

const TODAY = "2026-08-13";

function candidate(overrides: Partial<BodyCompositionCandidate>): BodyCompositionCandidate {
  return {
    date: TODAY,
    weightKg: 80,
    bodyFatPercent: 20,
    method: "measurements",
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("selectBodyCompositionForNutrition — sélection (§3/§13/§30 du brief Phase 7)", () => {
  it("§30 — aucun historique → null (pas d'erreur, pas de blocage)", () => {
    expect(selectBodyCompositionForNutrition([], TODAY)).toBeNull();
  });

  it("§13 — aucun candidat exploitable → null, jamais d'exception", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ method: null }), candidate({ bodyFatPercent: null })],
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("candidat valide et récent → sélectionné avec masse maigre calculée depuis bodyComposition.ts (Phase 6A, pas dupliqué)", () => {
    const result = selectBodyCompositionForNutrition([candidate({})], TODAY);
    expect(result).not.toBeNull();
    expect(result!.leanMassKg).toBeCloseTo(80 - 80 * 0.2, 5);
    expect(result!.method).toBe("measurements");
    expect(result!.confidence).toBe("medium");
  });

  it("§3 — pas de hiérarchie arbitraire de méthode : le plus RÉCENT valide l'emporte, même une méthode moins fiable qu'un candidat plus ancien", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ date: TODAY, method: "photo_estimate", bodyFatPercent: 18 }),
        candidate({ date: daysAgo(5), method: "dexa", bodyFatPercent: 20 }),
      ],
      TODAY,
    );
    expect(result!.method).toBe("photo_estimate");
  });

  it("méthode inconnue/invalide → candidat ignoré, le suivant valide est retenu", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ method: "invalid_method" }), candidate({ date: daysAgo(1), method: "dexa" })],
      TODAY,
    );
    expect(result!.method).toBe("dexa");
  });

  it("BF hors bornes 1-70 → candidat ignoré", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ bodyFatPercent: 0 }),
        candidate({ bodyFatPercent: 90 }),
        candidate({ bodyFatPercent: NaN }),
      ],
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("§5 — poids absent sur la MÊME ligne que le BF → candidat ignoré (jamais combiné à un poids d'une autre date)", () => {
    const result = selectBodyCompositionForNutrition([candidate({ weightKg: null })], TODAY);
    expect(result).toBeNull();
  });

  it("poids invalide (négatif/zéro/non fini) sur la ligne → candidat ignoré", () => {
    for (const weightKg of [0, -10, NaN, Infinity]) {
      expect(selectBodyCompositionForNutrition([candidate({ weightKg })], TODAY)).toBeNull();
    }
  });

  it(`§4 — mesure exactement à la limite de récence (${BODY_COMPOSITION_MAX_AGE_DAYS} jours) → encore exploitable`, () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ date: daysAgo(BODY_COMPOSITION_MAX_AGE_DAYS) })],
      TODAY,
    );
    expect(result).not.toBeNull();
  });

  it("§4/§36 — mesure au-delà de la fenêtre de récence → ignorée, repli poids corporel garanti côté appelant", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ date: daysAgo(BODY_COMPOSITION_MAX_AGE_DAYS + 1) })],
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("§21/§22/§35 — photo_estimate : usableForAutomaticAdjustment = false (confiance low)", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ method: "photo_estimate", bodyFatPercent: 18 })],
      TODAY,
    );
    expect(result!.usableForAutomaticAdjustment).toBe(false);
    expect(result!.isRange).toBe(true);
  });

  it("manual : usableForAutomaticAdjustment = false (confiance low, provenance réelle inconnue de Cortex)", () => {
    const result = selectBodyCompositionForNutrition([candidate({ method: "manual" })], TODAY);
    expect(result!.usableForAutomaticAdjustment).toBe(false);
  });

  it("dexa/bioimpedance/measurements : usableForAutomaticAdjustment = true (confiance medium/high)", () => {
    for (const method of ["dexa", "bioimpedance", "measurements"] as const) {
      const result = selectBodyCompositionForNutrition([candidate({ method })], TODAY);
      expect(result!.usableForAutomaticAdjustment).toBe(true);
      expect(result!.isRange).toBe(false);
    }
  });

  it("§34 — bioimpédance ne suppose pas un niveau de confiance arbitraire : reprend exactement le mapping centralisé bodyComposition.ts (medium)", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ method: "bioimpedance" })],
      TODAY,
    );
    expect(result!.confidence).toBe("medium");
  });
});

describe("computeLeanMassProteinTargetG — cible protéique dérivée de la masse maigre (§7/§9/§10/§11 du brief)", () => {
  it("§10 — coefficients distincts et NON équivalents à une conversion naïve poids→masse maigre (toujours plus conservateurs)", () => {
    for (const goal of ["fat_loss", "maintenance", "muscle_gain"] as const) {
      const naiveEquivalence = MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG[goal] / 0.8;
      expect(LEAN_MASS_PROTEIN_G_PER_KG[goal]).toBeLessThan(naiveEquivalence);
    }
  });

  it("calcule leanMassKg × coefficient de l'objectif", () => {
    const result = computeLeanMassProteinTargetG("fat_loss", 64);
    expect(result).toBeCloseTo(64 * LEAN_MASS_PROTEIN_G_PER_KG.fat_loss, 5);
  });

  it("les trois objectifs restent ordonnés comme le pipeline poids total (fat_loss ≥ muscle_gain > maintenance)", () => {
    const leanMassKg = 65;
    const fatLoss = computeLeanMassProteinTargetG("fat_loss", leanMassKg)!;
    const maintenance = computeLeanMassProteinTargetG("maintenance", leanMassKg)!;
    const muscleGain = computeLeanMassProteinTargetG("muscle_gain", leanMassKg)!;
    expect(fatLoss).toBeGreaterThan(maintenance);
    expect(muscleGain).toBeGreaterThan(maintenance);
    expect(fatLoss).toBeGreaterThanOrEqual(muscleGain);
  });

  it("masse maigre invalide (≤0/NaN/Infinity) → null, jamais une valeur fabriquée", () => {
    for (const leanMassKg of [0, -5, NaN, Infinity]) {
      expect(computeLeanMassProteinTargetG("maintenance", leanMassKg)).toBeNull();
    }
  });

  it("réutilise le plafond partagé BODYWEIGHT_CAP_KG — une masse maigre extrême ne fait pas grimper la cible indéfiniment", () => {
    const cappedResult = computeLeanMassProteinTargetG("fat_loss", 200);
    const atCapResult = computeLeanMassProteinTargetG(
      "fat_loss",
      MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG,
    );
    expect(cappedResult).toBeCloseTo(atCapResult!, 5);
  });
});
