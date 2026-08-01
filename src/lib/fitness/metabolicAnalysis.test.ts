import { describe, expect, it } from "vitest";
import {
  buildMetabolicAnalysis,
  CALIBRATION_PARTIAL_CORRECTION_EXPLANATION,
  DIVERGENCE_SUSPECTED_EXPLANATION,
  formatPercent,
  formatSignedKcal,
  type MetabolicAnalysisInput,
} from "./metabolicAnalysis";
import type { DailyTDEE } from "./tdee";
import type { AdaptiveTdeeResult } from "./adaptiveTdee";
import type { AdaptiveTdeeCalibrationResult } from "./adaptiveTdeeCalibration";

const COMPLETE_MODELED: DailyTDEE = {
  status: "complete",
  totalKcal: 2570,
  components: { bmr: 1650, neat: 420, eat: 310, tef: 190 },
  confidence: "medium",
};

const INSUFFICIENT_OBSERVED: AdaptiveTdeeResult = {
  status: "insufficient_data",
  observedTdeeKcal: null,
  confidence: null,
  window: { startDate: null, endDate: null, calendarDays: 0 },
  weight: {
    measurementCount: 0,
    startTrendKg: null,
    endTrendKg: null,
    trendChangeKg: null,
    weeklyTrendKg: null,
  },
  nutrition: { loggedDays: 0, coverage: 0, averageCalories: null },
  energyEquivalentKcalPerDay: null,
  comparison: null,
  reason: "Historique trop court (3 j, 7 j minimum).",
};

const ESTABLISHED_OBSERVED: AdaptiveTdeeResult = {
  status: "established",
  observedTdeeKcal: 2480,
  confidence: "high",
  window: { startDate: "2026-07-11", endDate: "2026-08-01", calendarDays: 21 },
  weight: {
    measurementCount: 17,
    startTrendKg: 80,
    endTrendKg: 79.4,
    trendChangeKg: -0.6,
    weeklyTrendKg: -0.28,
  },
  nutrition: { loggedDays: 19, coverage: 0.9, averageCalories: 2180 },
  energyEquivalentKcalPerDay: -308,
  comparison: { modeledTdeeKcal: 2570, deltaKcal: -90, deltaPercent: -3.5 },
  reason: "Estimation établie sur 21 j (17 pesées, 90 % de couverture nutritionnelle).",
};

const MODEL_ONLY_CALIBRATION: AdaptiveTdeeCalibrationResult = {
  state: "model_only",
  adaptiveTdeeKcal: 2570,
  modeledTdeeKcal: 2570,
  observedTdeeKcal: null,
  observedWeight: 0,
  rawDeltaKcal: null,
  appliedCorrectionKcal: 0,
  divergenceSuspected: false,
  confidence: null,
  reason: "Pas encore assez de données observées — le TDEE adaptatif reste égal au TDEE modélisé.",
};

const ADAPTED_CALIBRATION: AdaptiveTdeeCalibrationResult = {
  state: "adapted",
  adaptiveTdeeKcal: 2525,
  modeledTdeeKcal: 2570,
  observedTdeeKcal: 2480,
  observedWeight: 0.5,
  rawDeltaKcal: -90,
  appliedCorrectionKcal: -45,
  divergenceSuspected: false,
  confidence: "high",
  reason:
    "Historique suffisamment fiable — correction de -45 kcal appliquée au modèle (poids observé 50 %).",
};

const DIVERGENT_CALIBRATION: AdaptiveTdeeCalibrationResult = {
  ...ADAPTED_CALIBRATION,
  divergenceSuspected: true,
  rawDeltaKcal: 1300,
  appliedCorrectionKcal: 375,
  adaptiveTdeeKcal: 2945,
};

describe("formatPercent", () => {
  it("arrondit une fraction en pourcentage entier", () => {
    expect(formatPercent(0.862)).toBe(86);
    expect(formatPercent(0.6)).toBe(60);
    expect(formatPercent(0)).toBe(0);
    expect(formatPercent(1)).toBe(100);
  });
});

describe("formatSignedKcal", () => {
  it("préfixe les valeurs positives d'un +", () => {
    expect(formatSignedKcal(70)).toBe("+70 kcal");
  });
  it("garde le signe - pour les valeurs négatives", () => {
    expect(formatSignedKcal(-70)).toBe("-70 kcal");
  });
  it("n'ajoute aucun signe pour 0", () => {
    expect(formatSignedKcal(0)).toBe("0 kcal");
  });
});

describe("buildMetabolicAnalysis — dépense modélisée", () => {
  it("expose le total et les 4 composantes avec libellés compréhensibles + acronymes", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: INSUFFICIENT_OBSERVED,
      calibration: MODEL_ONLY_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.modeled.status).toBe("complete");
    expect(result.modeled.totalKcal).toBe(2570);
    expect(result.modeled.components).toEqual([
      { key: "bmr", label: "Métabolisme de base", acronym: "BMR", kcal: 1650 },
      { key: "neat", label: "Activité quotidienne", acronym: "NEAT", kcal: 420 },
      { key: "eat", label: "Entraînement", acronym: "EAT", kcal: 310 },
      { key: "tef", label: "Digestion", acronym: "TEF", kcal: 190 },
    ]);
  });

  it("reflète un statut incomplete sans fabriquer de total", () => {
    const incomplete: DailyTDEE = {
      status: "incomplete",
      totalKcal: null,
      components: { bmr: null, neat: null, eat: 300, tef: 200 },
      confidence: null,
    };
    const result = buildMetabolicAnalysis({
      dailyTDEE: incomplete,
      adaptiveTdee: INSUFFICIENT_OBSERVED,
      calibration: MODEL_ONLY_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.modeled.status).toBe("incomplete");
    expect(result.modeled.totalKcal).toBeNull();
    expect(result.modeled.components.find((c) => c.key === "bmr")!.kcal).toBeNull();
  });
});

describe("buildMetabolicAnalysis — TDEE observé disponible (established)", () => {
  it("expose période, pesées, couverture, apport moyen, tendance et confiance", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.observed.available).toBe(true);
    if (result.observed.available) {
      expect(result.observed.windowDays).toBe(21);
      expect(result.observed.measurementCount).toBe(17);
      expect(result.observed.nutritionCoveragePercent).toBe(90);
      expect(result.observed.averageCaloriesKcal).toBe(2180);
      expect(result.observed.weeklyTrendKgPerWeek).toBe(-0.28);
      expect(result.observed.observedTdeeKcal).toBe(2480);
      expect(result.observed.confidence.label).toBe("Élevée");
    }
  });

  it("n'affiche jamais un pourcentage scientifique de précision pour la confiance", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: null,
    });
    if (result.observed.available) {
      expect(result.observed.confidence.description).not.toMatch(/%/);
    }
  });
});

describe("buildMetabolicAnalysis — TDEE observé indisponible", () => {
  it("explique le manque et fournit des critères de progression, pas une date fabriquée", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: INSUFFICIENT_OBSERVED,
      calibration: MODEL_ONLY_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.observed.available).toBe(false);
    if (!result.observed.available) {
      expect(result.observed.reason).toBe(INSUFFICIENT_OBSERVED.reason);
      expect(result.observed.progress.weighIns).toEqual({ current: 0, required: 8 });
      expect(result.observed.progress.nutritionCoveragePercent).toEqual({
        current: 0,
        required: 60,
      });
      expect(result.observed.progress.calendarDays).toEqual({ current: 0, required: 14 });
    }
  });

  it("reflète une progression partielle réelle (early_estimate) sans jamais inventer un total", () => {
    const partial: AdaptiveTdeeResult = {
      ...INSUFFICIENT_OBSERVED,
      status: "early_estimate",
      window: { startDate: "2026-07-24", endDate: "2026-08-01", calendarDays: 9 },
      weight: {
        measurementCount: 4,
        startTrendKg: 80,
        endTrendKg: 79.8,
        trendChangeKg: -0.2,
        weeklyTrendKg: -0.15,
      },
      nutrition: { loggedDays: 4, coverage: 0.44, averageCalories: 2300 },
      confidence: "low",
      observedTdeeKcal: 2350,
      reason: "Estimation précoce sur 9 j.",
    };
    // early_estimate a un observedTdeeKcal ET une confidence -> considéré "available" pour l'affichage.
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: partial,
      calibration: { ...MODEL_ONLY_CALIBRATION, state: "calibrating" },
      calorieGoalKcal: null,
    });
    expect(result.observed.available).toBe(true);
  });
});

describe("buildMetabolicAnalysis — calibration (état)", () => {
  it("model_only → libellé 'Modèle initial'", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: INSUFFICIENT_OBSERVED,
      calibration: MODEL_ONLY_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.calibration.stateLabel).toBe("Modèle initial");
    expect(result.calibration.adaptiveTdeeKcal).toBe(2570);
  });

  it("calibrating → libellé 'Calibration en cours'", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: { ...ADAPTED_CALIBRATION, state: "calibrating" },
      calorieGoalKcal: null,
    });
    expect(result.calibration.stateLabel).toBe("Calibration en cours");
  });

  it("adapted → libellé 'Calibré'", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.calibration.stateLabel).toBe("Calibré");
  });
});

describe("buildMetabolicAnalysis — calibration (correction)", () => {
  it("correction positive exposée telle quelle", () => {
    const positive: AdaptiveTdeeCalibrationResult = {
      ...ADAPTED_CALIBRATION,
      appliedCorrectionKcal: 60,
      rawDeltaKcal: 120,
      adaptiveTdeeKcal: 2630,
    };
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: positive,
      calorieGoalKcal: null,
    });
    expect(result.calibration.appliedCorrectionKcal).toBe(60);
    expect(result.calibration.rawDeltaKcal).toBe(120);
  });

  it("correction négative exposée telle quelle (exemple d'explicabilité du brief)", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: { ...COMPLETE_MODELED, totalKcal: 2620 },
      adaptiveTdee: { ...ESTABLISHED_OBSERVED, observedTdeeKcal: 2480 },
      calibration: {
        ...ADAPTED_CALIBRATION,
        modeledTdeeKcal: 2620,
        observedTdeeKcal: 2480,
        rawDeltaKcal: -140,
        appliedCorrectionKcal: -70,
        adaptiveTdeeKcal: 2550,
      },
      calorieGoalKcal: null,
    });
    expect(result.calibration.modeledTdeeKcal).toBe(2620);
    expect(result.calibration.observedTdeeKcal).toBe(2480);
    expect(result.calibration.rawDeltaKcal).toBe(-140);
    expect(result.calibration.appliedCorrectionKcal).toBe(-70);
    expect(result.calibration.adaptiveTdeeKcal).toBe(2550);
  });

  it("correction nulle (modèle = observé)", () => {
    const equal: AdaptiveTdeeCalibrationResult = {
      ...ADAPTED_CALIBRATION,
      rawDeltaKcal: 0,
      appliedCorrectionKcal: 0,
      adaptiveTdeeKcal: 2570,
      observedTdeeKcal: 2570,
    };
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: equal,
      calorieGoalKcal: null,
    });
    expect(result.calibration.appliedCorrectionKcal).toBe(0);
  });
});

describe("buildMetabolicAnalysis — explication de la correction", () => {
  it("explication standard quand la divergence n'est pas suspecte", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.calibration.explanation).toBe(CALIBRATION_PARTIAL_CORRECTION_EXPLANATION);
    expect(result.calibration.divergenceSuspected).toBe(false);
  });

  it("explication de divergence suspecte, sans diagnostic de cause", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: DIVERGENT_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.calibration.explanation).toBe(DIVERGENCE_SUSPECTED_EXPLANATION);
    expect(result.calibration.divergenceSuspected).toBe(true);
    expect(result.calibration.explanation.toLowerCase()).not.toMatch(
      /métabolisme ralenti|adaptation métabolique|mauvais tracking|rétention d'eau/,
    );
  });
});

describe("buildMetabolicAnalysis — objectif calorique", () => {
  it("expose l'objectif calorique séparément, jamais fusionné avec une dépense", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: 2100,
    });
    expect(result.calorieGoalKcal).toBe(2100);
    expect(result.calorieGoalKcal).not.toBe(result.modeled.totalKcal);
    expect(result.calorieGoalKcal).not.toBe(result.calibration.adaptiveTdeeKcal);
  });

  it("null si aucun objectif défini", () => {
    const result = buildMetabolicAnalysis({
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: null,
    });
    expect(result.calorieGoalKcal).toBeNull();
  });
});

describe("buildMetabolicAnalysis — robustesse", () => {
  it("input complet valide sans exception", () => {
    const input: MetabolicAnalysisInput = {
      dailyTDEE: COMPLETE_MODELED,
      adaptiveTdee: ESTABLISHED_OBSERVED,
      calibration: ADAPTED_CALIBRATION,
      calorieGoalKcal: 2200,
    };
    expect(() => buildMetabolicAnalysis(input)).not.toThrow();
  });
});
