import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS,
  ADAPTIVE_TDEE_CALIBRATION_WEIGHTS,
  computeAdaptiveTdeeCalibration,
  type AdaptiveTdeeCalibrationInput,
} from "./adaptiveTdeeCalibration";
import type { AdaptiveTdeeConfidence, AdaptiveTdeeStatus } from "./adaptiveTdee";

const ESTABLISHED_HIGH: AdaptiveTdeeCalibrationInput = {
  modeledTdeeKcal: 2500,
  observedTdeeKcal: 2500,
  observedStatus: "established",
  observedConfidence: "high",
};

describe("computeAdaptiveTdeeCalibration — model_only", () => {
  it("observé indisponible (status insufficient_data)", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: null,
      observedStatus: "insufficient_data",
      observedConfidence: null,
    });
    expect(result.state).toBe("model_only");
    expect(result.adaptiveTdeeKcal).toBe(2500);
    expect(result.appliedCorrectionKcal).toBe(0);
    expect(result.observedWeight).toBe(0);
  });

  it("exemple du brief — aucune donnée observée : adaptatif = modélisé, correction = 0", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: null,
      observedStatus: "insufficient_data",
      observedConfidence: null,
    });
    expect(result.adaptiveTdeeKcal).toBe(2500);
    expect(result.state).toBe("model_only");
    expect(result.appliedCorrectionKcal).toBe(0);
  });

  it("données insuffisantes malgré un observedTdeeKcal renseigné par erreur (status prime)", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 2200,
      observedStatus: "insufficient_data",
      observedConfidence: null,
    });
    expect(result.state).toBe("model_only");
    expect(result.adaptiveTdeeKcal).toBe(2500);
  });
});

describe("computeAdaptiveTdeeCalibration — calibrating (early_estimate)", () => {
  it("exemple du brief — estimation précoce : petite correction seulement, pas l'observé directement", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 2350,
      observedStatus: "early_estimate",
      observedConfidence: "low",
    });
    expect(result.state).toBe("calibrating");
    expect(result.adaptiveTdeeKcal).not.toBeNull();
    expect(result.adaptiveTdeeKcal!).not.toBe(2350);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2500);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2400);
    expect(result.observedWeight).toBeLessThan(0.3);
  });

  it("confiance faible → poids limité", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 2300,
      observedStatus: "early_estimate",
      observedConfidence: "low",
    });
    expect(result.observedWeight).toBe(ADAPTIVE_TDEE_CALIBRATION_WEIGHTS.early_estimate.low);
  });

  it("petit delta positif (observé > modélisé) → correction dans la bonne direction", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2300,
      observedTdeeKcal: 2350,
      observedStatus: "early_estimate",
      observedConfidence: "low",
    });
    expect(result.rawDeltaKcal).toBe(50);
    expect(result.appliedCorrectionKcal).toBeGreaterThan(0);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2300);
  });

  it("petit delta négatif (observé < modélisé) → correction dans la bonne direction", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2300,
      observedTdeeKcal: 2250,
      observedStatus: "early_estimate",
      observedConfidence: "low",
    });
    expect(result.rawDeltaKcal).toBe(-50);
    expect(result.appliedCorrectionKcal).toBeLessThan(0);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2300);
  });
});

describe("computeAdaptiveTdeeCalibration — adapted (established)", () => {
  it("exemple du brief — confiance élevée : rapproché de l'observé sans l'atteindre", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2600,
      observedTdeeKcal: 2450,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.state).toBe("adapted");
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2600);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2450);
  });

  it("exemple d'explicabilité du brief — modèle 2620, observation 2480, ajustement -70 → adaptatif 2550", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2620,
      observedTdeeKcal: 2480,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.appliedCorrectionKcal).toBe(-70);
    expect(result.adaptiveTdeeKcal).toBe(2550);
  });

  it("established/medium → poids intermédiaire, entre early_estimate et established/high", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 2300,
      observedStatus: "established",
      observedConfidence: "medium",
    });
    expect(result.observedWeight).toBe(ADAPTIVE_TDEE_CALIBRATION_WEIGHTS.established.medium);
    expect(result.observedWeight).toBeGreaterThan(
      ADAPTIVE_TDEE_CALIBRATION_WEIGHTS.early_estimate.low,
    );
    expect(result.observedWeight).toBeLessThan(ADAPTIVE_TDEE_CALIBRATION_WEIGHTS.established.high);
  });

  it("observé inférieur au modélisé → correction négative", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2700,
      observedTdeeKcal: 2500,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.appliedCorrectionKcal).toBeLessThan(0);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2700);
  });

  it("observé supérieur au modélisé → correction positive", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2300,
      observedTdeeKcal: 2550,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.appliedCorrectionKcal).toBeGreaterThan(0);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2300);
  });
});

describe("computeAdaptiveTdeeCalibration — garde-fous", () => {
  it("exemple du brief — divergence très importante (2500 vs 3800) : jamais proche de l'observé", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 3800,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.divergenceSuspected).toBe(true);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(3000);
    expect(Math.abs(result.adaptiveTdeeKcal! - 3800)).toBeGreaterThan(800);
  });

  it("divergence suspecte → poids amorti par rapport au poids de base", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 3800,
      observedStatus: "established",
      observedConfidence: "high",
    });
    const baseWeight = ADAPTIVE_TDEE_CALIBRATION_WEIGHTS.established.high;
    expect(result.observedWeight).toBeLessThan(baseWeight);
    expect(result.observedWeight).toBeCloseTo(
      baseWeight * ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS.DIVERGENCE_DAMPING_FACTOR,
      2,
    );
  });

  it("observed invalide (NaN) → traité comme non exploitable, model_only", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: Number.NaN,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.state).toBe("model_only");
    expect(result.adaptiveTdeeKcal).toBe(2500);
  });

  it("observed invalide (Infinity) → traité comme non exploitable", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: Number.POSITIVE_INFINITY,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.state).toBe("model_only");
    expect(result.adaptiveTdeeKcal).toBe(2500);
  });

  it("observed négatif ou nul → traité comme non exploitable (pas de TDEE physiquement valide)", () => {
    const negative = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: -100,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(negative.state).toBe("model_only");
    const zero = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 0,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(zero.state).toBe("model_only");
  });

  it("modeled invalide (null) → aucune ancre, adaptiveTdeeKcal null", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: null,
      observedTdeeKcal: 2400,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.state).toBe("model_only");
    expect(result.adaptiveTdeeKcal).toBeNull();
    expect(result.appliedCorrectionKcal).toBe(0);
  });

  it("modeled invalide (NaN/Infinity/négatif) → aucune ancre, jamais de crash", () => {
    for (const modeledTdeeKcal of [Number.NaN, Number.POSITIVE_INFINITY, -500, 0]) {
      const result = computeAdaptiveTdeeCalibration({
        modeledTdeeKcal,
        observedTdeeKcal: 2400,
        observedStatus: "established",
        observedConfidence: "high",
      });
      expect(result.state).toBe("model_only");
      expect(result.adaptiveTdeeKcal).toBeNull();
    }
  });

  it("correction maximale respectée même avec une divergence extrême et un poids élevé", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 10000,
      observedStatus: "established",
      observedConfidence: "high",
    });
    const maxCorrectionKcal = Math.min(
      ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS.MAX_CORRECTION_KCAL,
      2500 * ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS.MAX_CORRECTION_PERCENT,
    );
    expect(Math.abs(result.appliedCorrectionKcal)).toBeLessThanOrEqual(
      Math.round(maxCorrectionKcal),
    );
  });

  it("poids observé n'atteint jamais 1, quel que soit l'état/la confiance", () => {
    const statuses: AdaptiveTdeeStatus[] = ["insufficient_data", "early_estimate", "established"];
    const confidences: AdaptiveTdeeConfidence[] = ["low", "medium", "high"];
    for (const observedStatus of statuses) {
      for (const observedConfidence of confidences) {
        expect(ADAPTIVE_TDEE_CALIBRATION_WEIGHTS[observedStatus][observedConfidence]).toBeLessThan(
          1,
        );
      }
    }
  });

  it("poids observé n'atteint jamais 1 sur le résultat calculé, y compris en confiance haute", () => {
    const result = computeAdaptiveTdeeCalibration(ESTABLISHED_HIGH);
    expect(result.observedWeight).toBeLessThan(1);
  });
});

describe("computeAdaptiveTdeeCalibration — cohérence", () => {
  it("adaptiveTdeeKcal = modeledTdeeKcal + appliedCorrectionKcal", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2650,
      observedTdeeKcal: 2500,
      observedStatus: "established",
      observedConfidence: "medium",
    });
    expect(result.adaptiveTdeeKcal).toBe(result.modeledTdeeKcal! + result.appliedCorrectionKcal);
  });

  it("la correction va toujours dans la direction du signe du delta brut", () => {
    const positive = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2300,
      observedTdeeKcal: 2500,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(Math.sign(positive.appliedCorrectionKcal)).toBe(Math.sign(positive.rawDeltaKcal!));

    const negative = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2700,
      observedTdeeKcal: 2400,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(Math.sign(negative.appliedCorrectionKcal)).toBe(Math.sign(negative.rawDeltaKcal!));
  });

  it("égalité modèle/observé → correction nulle", () => {
    const result = computeAdaptiveTdeeCalibration(ESTABLISHED_HIGH);
    expect(result.rawDeltaKcal).toBe(0);
    expect(result.appliedCorrectionKcal).toBe(0);
    expect(result.adaptiveTdeeKcal).toBe(2500);
  });

  it("ne modifie jamais modeledTdeeKcal ni observedTdeeKcal fournis en entrée", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2650,
      observedTdeeKcal: 2500,
      observedStatus: "established",
      observedConfidence: "medium",
    });
    expect(result.modeledTdeeKcal).toBe(2650);
    expect(result.observedTdeeKcal).toBe(2500);
  });
});

describe("computeAdaptiveTdeeCalibration — scénarios synthétiques", () => {
  it("utilisateur stable : modèle proche de l'observé → très faible correction", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 2510,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(Math.abs(result.appliedCorrectionKcal)).toBeLessThan(15);
    expect(result.divergenceSuspected).toBe(false);
  });

  it("modèle surestimé (2700 vs ~2450) → correction progressive vers le bas", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2700,
      observedTdeeKcal: 2450,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.appliedCorrectionKcal).toBeLessThan(0);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2700);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2450);
  });

  it("modèle sous-estimé (2300 vs ~2550) → correction progressive vers le haut", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2300,
      observedTdeeKcal: 2550,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.appliedCorrectionKcal).toBeGreaterThan(0);
    expect(result.adaptiveTdeeKcal!).toBeGreaterThan(2300);
    expect(result.adaptiveTdeeKcal!).toBeLessThan(2550);
  });

  it("observation aberrante (2500 vs 4000) → garde-fou activé, état adapted mais correction plafonnée", () => {
    const result = computeAdaptiveTdeeCalibration({
      modeledTdeeKcal: 2500,
      observedTdeeKcal: 4000,
      observedStatus: "established",
      observedConfidence: "high",
    });
    expect(result.divergenceSuspected).toBe(true);
    const maxCorrectionKcal = Math.min(
      ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS.MAX_CORRECTION_KCAL,
      2500 * ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS.MAX_CORRECTION_PERCENT,
    );
    expect(result.appliedCorrectionKcal).toBeLessThanOrEqual(Math.round(maxCorrectionKcal));
    expect(result.adaptiveTdeeKcal!).toBeLessThan(3000);
  });
});

describe("computeAdaptiveTdeeCalibration — jamais de correction automatique hors dépense", () => {
  it("le résultat ne contient aucune référence à un objectif calorique ou des macros", () => {
    const result = computeAdaptiveTdeeCalibration(ESTABLISHED_HIGH);
    const keys = Object.keys(result);
    expect(keys).not.toContain("nutritionGoals");
    expect(keys).not.toContain("macros");
    expect(keys).not.toContain("calorieGoal");
  });
});
