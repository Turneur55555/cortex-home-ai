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
const CURRENT_WEIGHT_KG = 70.3;

function candidate(overrides: Partial<BodyCompositionCandidate>): BodyCompositionCandidate {
  return {
    date: TODAY,
    method: "measurements",
    bodyFatPercent: 15,
    bodyFatMinPercent: null,
    bodyFatMaxPercent: null,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("selectBodyCompositionForNutrition — Body Fat Cortex (mensurations + photos uniquement)", () => {
  it("aucun historique → null (pas d'erreur, pas de blocage)", () => {
    expect(selectBodyCompositionForNutrition([], TODAY, CURRENT_WEIGHT_KG)).toBeNull();
  });

  it("poids actuel absent/invalide → null, même avec un candidat par ailleurs exploitable", () => {
    for (const weight of [null, 0, -5, NaN, Infinity]) {
      expect(selectBodyCompositionForNutrition([candidate({})], TODAY, weight)).toBeNull();
    }
  });

  it("mensurations exploitables → sélectionnées, masse maigre calculée avec le POIDS ACTUEL (§14), pas un poids historique", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ bodyFatPercent: 15 })],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).not.toBeNull();
    expect(result!.weightKg).toBe(CURRENT_WEIGHT_KG);
    expect(result!.leanMassKg).toBeCloseTo(CURRENT_WEIGHT_KG - CURRENT_WEIGHT_KG * 0.15, 1);
    expect(result!.method).toBe("measurements");
    expect(result!.methodsUsed).toEqual(["measurements"]);
    expect(result!.confidence).toBe("medium");
  });

  it("§14 — un poids historique porté par la ligne d'origine (ex. 74,2 kg) n'affecte JAMAIS la masse maigre actuelle : seul le poids ACTUEL fourni compte", () => {
    const resultAtCurrentWeight = selectBodyCompositionForNutrition(
      [candidate({ bodyFatPercent: 15 })],
      TODAY,
      70.3,
    );
    const resultAtDifferentWeight = selectBodyCompositionForNutrition(
      [candidate({ bodyFatPercent: 15 })],
      TODAY,
      74.2,
    );
    expect(resultAtCurrentWeight!.leanMassKg).not.toBeCloseTo(
      resultAtDifferentWeight!.leanMassKg,
      1,
    );
    expect(resultAtCurrentWeight!.weightKg).toBe(70.3);
    expect(resultAtDifferentWeight!.weightKg).toBe(74.2);
  });

  it("photo seule → sélectionnée, fourchette conservée, usableForAutomaticAdjustment=false (confiance low)", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({
          method: "photo_estimate",
          bodyFatPercent: 15.5,
          bodyFatMinPercent: 14,
          bodyFatMaxPercent: 17,
        }),
      ],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result!.isRange).toBe(true);
    expect(result!.bodyFatMinPercent).toBe(14);
    expect(result!.bodyFatMaxPercent).toBe(17);
    expect(result!.usableForAutomaticAdjustment).toBe(false);
  });

  it("mensurations + photos concordantes → les deux méthodes contribuent, method=null (methodsUsed contient les deux)", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ date: TODAY, method: "measurements", bodyFatPercent: 15 }),
        candidate({
          date: TODAY,
          method: "photo_estimate",
          bodyFatPercent: 15.5,
          bodyFatMinPercent: 14,
          bodyFatMaxPercent: 17,
        }),
      ],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result!.method).toBeNull();
    expect(result!.methodsUsed).toEqual(["measurements", "photo_estimate"]);
    expect(result!.disagreement).toBe(false);
    expect(result!.usableForAutomaticAdjustment).toBe(true);
  });

  it("mensurations + photos discordantes → disagreement=true, usableForAutomaticAdjustment=false", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ date: TODAY, method: "measurements", bodyFatPercent: 12 }),
        candidate({
          date: TODAY,
          method: "photo_estimate",
          bodyFatPercent: 17.5,
          bodyFatMinPercent: 16,
          bodyFatMaxPercent: 19,
        }),
      ],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result!.disagreement).toBe(true);
    expect(result!.usableForAutomaticAdjustment).toBe(false);
  });

  it("RÈGLE ABSOLUE — manual/dexa/bioimpedance (méthodes externes) n'ont AUCUNE contribution, quelle que soit leur valeur ou leur récence", () => {
    const withoutExternal = selectBodyCompositionForNutrition(
      [candidate({ method: "measurements", bodyFatPercent: 15 })],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    for (const method of ["manual", "dexa", "bioimpedance"] as const) {
      const withExternal = selectBodyCompositionForNutrition(
        [
          candidate({ date: TODAY, method, bodyFatPercent: 8 }),
          candidate({ date: TODAY, method: "measurements", bodyFatPercent: 15 }),
        ],
        TODAY,
        CURRENT_WEIGHT_KG,
      );
      expect(withExternal).toEqual(withoutExternal);
    }
  });

  it("uniquement des méthodes externes (manual/dexa/bioimpedance), aucune mensuration/photo → null, jamais de repli sur l'externe", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ method: "manual", bodyFatPercent: 8 }),
        candidate({ date: daysAgo(10), method: "dexa", bodyFatPercent: 11 }),
        candidate({ date: daysAgo(20), method: "bioimpedance", bodyFatPercent: 9 }),
      ],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).toBeNull();
  });

  it("méthode inconnue/invalide → ignorée comme une méthode externe (aucune contribution)", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ method: "invalid_method" })],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).toBeNull();
  });

  it("BF hors bornes 1-70 → candidat ignoré", () => {
    const result = selectBodyCompositionForNutrition(
      [
        candidate({ bodyFatPercent: 0 }),
        candidate({ bodyFatPercent: 90 }),
        candidate({ bodyFatPercent: NaN }),
      ],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).toBeNull();
  });

  it(`mesure exactement à la limite de récence (${BODY_COMPOSITION_MAX_AGE_DAYS} jours) → encore exploitable`, () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ date: daysAgo(BODY_COMPOSITION_MAX_AGE_DAYS) })],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).not.toBeNull();
  });

  it("mesure au-delà de la fenêtre de récence → ignorée, repli poids corporel garanti côté appelant", () => {
    const result = selectBodyCompositionForNutrition(
      [candidate({ date: daysAgo(BODY_COMPOSITION_MAX_AGE_DAYS + 1) })],
      TODAY,
      CURRENT_WEIGHT_KG,
    );
    expect(result).toBeNull();
  });
});

describe("computeLeanMassProteinTargetG — cible protéique dérivée de la masse maigre (§7/§9/§10/§11 du brief Phase 7)", () => {
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
