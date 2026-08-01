import { describe, expect, it } from "vitest";
import {
  AUTO_CALORIE_ADJUSTMENT_CONFIG,
  CALORIE_STRATEGY_GUARDRAILS,
  CALORIE_STRATEGY_RATES,
  compareCalorieGoal,
  computeCalorieStrategy,
  evaluateAutoCalorieAdjustment,
  type AutoCalorieAdjustmentInput,
  type CalorieStrategyInput,
} from "./calorieStrategy";
import type { AdaptiveTdeeCalibrationResult } from "./adaptiveTdeeCalibration";

const MODEL_ONLY: AdaptiveTdeeCalibrationResult = {
  state: "model_only",
  adaptiveTdeeKcal: 2500,
  modeledTdeeKcal: 2500,
  observedTdeeKcal: null,
  observedWeight: 0,
  rawDeltaKcal: null,
  appliedCorrectionKcal: 0,
  divergenceSuspected: false,
  confidence: null,
  reason: "model_only",
};

const ADAPTED: AdaptiveTdeeCalibrationResult = {
  state: "adapted",
  adaptiveTdeeKcal: 2520,
  modeledTdeeKcal: 2570,
  observedTdeeKcal: 2480,
  observedWeight: 0.5,
  rawDeltaKcal: -90,
  appliedCorrectionKcal: -50,
  divergenceSuspected: false,
  confidence: "high",
  reason: "adapted",
};

const NO_TDEE: AdaptiveTdeeCalibrationResult = {
  state: "model_only",
  adaptiveTdeeKcal: null,
  modeledTdeeKcal: null,
  observedTdeeKcal: null,
  observedWeight: 0,
  rawDeltaKcal: null,
  appliedCorrectionKcal: 0,
  divergenceSuspected: false,
  confidence: null,
  reason: "no tdee",
};

const baseInput = (overrides: Partial<CalorieStrategyInput>): CalorieStrategyInput => ({
  goal: "fat_loss",
  rate: "moderate",
  weightKg: 80,
  calibration: MODEL_ONLY,
  ...overrides,
});

describe("computeCalorieStrategy — perte de graisse", () => {
  it("rythme progressif (slow) — déficit correctement signé et cohérent", () => {
    const result = computeCalorieStrategy(baseInput({ rate: "slow" }));
    expect(result.dailyDeltaKcal).not.toBeNull();
    expect(result.dailyDeltaKcal!).toBeLessThan(0);
    expect(result.recommendedCalories).toBe(result.referenceTdeeKcal! + result.dailyDeltaKcal!);
  });

  it("rythme modéré (moderate) — déficit plus important que progressif", () => {
    const slow = computeCalorieStrategy(baseInput({ rate: "slow" }));
    const moderate = computeCalorieStrategy(baseInput({ rate: "moderate" }));
    expect(Math.abs(moderate.dailyDeltaKcal!)).toBeGreaterThan(Math.abs(slow.dailyDeltaKcal!));
  });

  it("rythme rapide (fast) — déficit plus important que modéré", () => {
    const moderate = computeCalorieStrategy(baseInput({ rate: "moderate" }));
    const fast = computeCalorieStrategy(baseInput({ rate: "fast" }));
    expect(Math.abs(fast.dailyDeltaKcal!)).toBeGreaterThan(Math.abs(moderate.dailyDeltaKcal!));
  });

  it("différents poids produisent des déficits différents (relatif au poids, pas fixe)", () => {
    const light = computeCalorieStrategy(baseInput({ weightKg: 60, rate: "moderate" }));
    const heavy = computeCalorieStrategy(baseInput({ weightKg: 100, rate: "moderate" }));
    expect(Math.abs(heavy.dailyDeltaKcal!)).toBeGreaterThan(Math.abs(light.dailyDeltaKcal!));
  });

  it("différents TDEE de référence changent la cible mais pas le déficit relatif au poids", () => {
    const lowTdee = computeCalorieStrategy(
      baseInput({ calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 2000, modeledTdeeKcal: 2000 } }),
    );
    const highTdee = computeCalorieStrategy(
      baseInput({ calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 2800, modeledTdeeKcal: 2800 } }),
    );
    expect(lowTdee.dailyDeltaKcal).toBe(highTdee.dailyDeltaKcal);
    expect(lowTdee.recommendedCalories).not.toBe(highTdee.recommendedCalories);
  });

  it("déficit correctement signé (négatif)", () => {
    const result = computeCalorieStrategy(baseInput({}));
    expect(result.dailyDeltaKcal).toBeLessThan(0);
    expect(result.estimatedWeeklyWeightChangeKg).toBeLessThan(0);
  });

  it("garde-fou activé pour un poids très élevé + rythme rapide", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: 200, rate: "fast" }));
    expect(result.limited).toBe(true);
    expect(result.limitReasons.some((r) => r.includes("plafonné"))).toBe(true);
    expect(Math.abs(result.dailyDeltaKcal!)).toBeLessThanOrEqual(
      CALORIE_STRATEGY_GUARDRAILS.MAX_DEFICIT_KCAL,
    );
  });

  it("la valeur recommandée est arrondie au pas de 25 kcal", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: 73, rate: "moderate" }));
    expect(result.recommendedCalories! % 25).toBe(0);
  });
});

describe("computeCalorieStrategy — maintien", () => {
  it("utilise le TDEE modélisé si aucune calibration adaptative réelle — delta = 0", () => {
    const result = computeCalorieStrategy(
      baseInput({ goal: "maintenance", calibration: MODEL_ONLY }),
    );
    expect(result.referenceSource).toBe("modeled");
    expect(result.recommendedCalories).toBe(2500);
    expect(result.dailyDeltaKcal).toBe(0);
    expect(result.targetRate).toBeNull();
  });

  it("utilise le TDEE adaptatif quand une calibration réelle existe — delta = 0", () => {
    const result = computeCalorieStrategy(baseInput({ goal: "maintenance", calibration: ADAPTED }));
    expect(result.referenceSource).toBe("adaptive");
    expect(result.recommendedCalories).toBe(2520);
    expect(result.dailyDeltaKcal).toBe(0);
  });

  it("la cible n'est jamais un artefact d'arrondi à 25 kcal", () => {
    const result = computeCalorieStrategy(
      baseInput({
        goal: "maintenance",
        calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 2517, modeledTdeeKcal: 2517 },
      }),
    );
    expect(result.recommendedCalories).toBe(2517);
    expect(result.dailyDeltaKcal).toBe(0);
  });
});

describe("computeCalorieStrategy — prise de masse", () => {
  it("surplus progressif (slow)", () => {
    const result = computeCalorieStrategy(baseInput({ goal: "muscle_gain", rate: "slow" }));
    expect(result.dailyDeltaKcal).not.toBeNull();
    expect(result.dailyDeltaKcal!).toBeGreaterThan(0);
  });

  it("plusieurs poids produisent des surplus différents", () => {
    const light = computeCalorieStrategy(
      baseInput({ goal: "muscle_gain", weightKg: 60, rate: "moderate" }),
    );
    const heavy = computeCalorieStrategy(
      baseInput({ goal: "muscle_gain", weightKg: 100, rate: "moderate" }),
    );
    expect(heavy.dailyDeltaKcal!).toBeGreaterThan(light.dailyDeltaKcal!);
  });

  it("plusieurs TDEE changent la cible mais pas le surplus", () => {
    const lowTdee = computeCalorieStrategy(
      baseInput({
        goal: "muscle_gain",
        calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 2200, modeledTdeeKcal: 2200 },
      }),
    );
    const highTdee = computeCalorieStrategy(
      baseInput({
        goal: "muscle_gain",
        calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 3000, modeledTdeeKcal: 3000 },
      }),
    );
    expect(lowTdee.dailyDeltaKcal).toBe(highTdee.dailyDeltaKcal);
    expect(lowTdee.recommendedCalories).not.toBe(highTdee.recommendedCalories);
  });

  it("surplus correctement signé (positif)", () => {
    const result = computeCalorieStrategy(baseInput({ goal: "muscle_gain", rate: "moderate" }));
    expect(result.dailyDeltaKcal).toBeGreaterThan(0);
    expect(result.estimatedWeeklyWeightChangeKg).toBeGreaterThan(0);
  });

  it("garde-fou maximal activé pour un poids très élevé", () => {
    const result = computeCalorieStrategy(
      baseInput({ goal: "muscle_gain", weightKg: 220, rate: "moderate" }),
    );
    expect(result.limited).toBe(true);
    expect(result.dailyDeltaKcal!).toBeLessThanOrEqual(
      CALORIE_STRATEGY_GUARDRAILS.MAX_SURPLUS_KCAL,
    );
  });
});

describe("computeCalorieStrategy — source du TDEE de référence", () => {
  it("TDEE adaptatif disponible (calibration réelle) → utilisé en priorité", () => {
    const result = computeCalorieStrategy(baseInput({ goal: "maintenance", calibration: ADAPTED }));
    expect(result.referenceSource).toBe("adaptive");
    expect(result.referenceTdeeKcal).toBe(ADAPTED.adaptiveTdeeKcal);
  });

  it("TDEE adaptatif indisponible (model_only) → repli sur le modélisé", () => {
    const result = computeCalorieStrategy(
      baseInput({ goal: "maintenance", calibration: MODEL_ONLY }),
    );
    expect(result.referenceSource).toBe("modeled");
    expect(result.referenceTdeeKcal).toBe(MODEL_ONLY.modeledTdeeKcal);
  });

  it("aucun TDEE exploitable → recommandation indisponible, jamais de cible fabriquée", () => {
    const result = computeCalorieStrategy(baseInput({ goal: "maintenance", calibration: NO_TDEE }));
    expect(result.referenceTdeeKcal).toBeNull();
    expect(result.recommendedCalories).toBeNull();
    expect(result.limited).toBe(true);
    expect(result.limitReasons.length).toBeGreaterThan(0);
  });
});

describe("compareCalorieGoal — objectif actuel vs recommandation", () => {
  it("current < recommended → écart positif", () => {
    const result = compareCalorieGoal(2000, 2150);
    expect(result.differenceKcal).toBe(150);
  });

  it("current > recommended → écart négatif", () => {
    const result = compareCalorieGoal(2200, 2000);
    expect(result.differenceKcal).toBe(-200);
  });

  it("current = recommended → écart nul", () => {
    const result = compareCalorieGoal(2100, 2100);
    expect(result.differenceKcal).toBe(0);
  });

  it("objectif actuel absent → écart null, mais recommendedCalories toujours exposé", () => {
    const result = compareCalorieGoal(null, 2100);
    expect(result.differenceKcal).toBeNull();
    expect(result.recommendedCalories).toBe(2100);
  });
});

describe("computeCalorieStrategy — robustesse", () => {
  it("NaN dans le poids → non exploitable, pas de crash", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: Number.NaN }));
    expect(result.recommendedCalories).toBeNull();
    expect(result.limited).toBe(true);
  });

  it("Infinity dans le poids → non exploitable, pas de crash", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: Number.POSITIVE_INFINITY }));
    expect(result.recommendedCalories).toBeNull();
  });

  it("poids négatif → non exploitable", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: -70 }));
    expect(result.recommendedCalories).toBeNull();
  });

  it("poids nul (0) → non exploitable", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: 0 }));
    expect(result.recommendedCalories).toBeNull();
  });

  it("poids absent (null) → non exploitable, message explicite", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: null }));
    expect(result.recommendedCalories).toBeNull();
    expect(result.limitReasons[0]).toMatch(/poids/i);
  });

  it("TDEE nul/invalide dans la calibration → recommandation indisponible", () => {
    const result = computeCalorieStrategy(baseInput({ calibration: NO_TDEE }));
    expect(result.recommendedCalories).toBeNull();
  });

  it("objectif inconnu → non exploitable", () => {
    const result = computeCalorieStrategy(
      baseInput({ goal: "bulk" as unknown as CalorieStrategyInput["goal"] }),
    );
    expect(result.recommendedCalories).toBeNull();
    expect(result.limited).toBe(true);
  });

  it("rythme inconnu → non exploitable", () => {
    const result = computeCalorieStrategy(
      baseInput({ rate: "extreme" as unknown as CalorieStrategyInput["rate"] }),
    );
    expect(result.recommendedCalories).toBeNull();
  });

  it("rythme manquant pour fat_loss/muscle_gain → non exploitable", () => {
    const result = computeCalorieStrategy(baseInput({ rate: undefined }));
    expect(result.recommendedCalories).toBeNull();
  });

  it("valeurs extrêmes (poids très élevé) restent plafonnées sans exception", () => {
    expect(() => computeCalorieStrategy(baseInput({ weightKg: 5000, rate: "fast" }))).not.toThrow();
    const result = computeCalorieStrategy(baseInput({ weightKg: 5000, rate: "fast" }));
    expect(result.limited).toBe(true);
    expect(result.recommendedCalories).not.toBeNull();
    expect(result.recommendedCalories!).toBeGreaterThanOrEqual(0);
  });

  it("cible calorique jamais négative", () => {
    const result = computeCalorieStrategy(
      baseInput({
        weightKg: 999,
        rate: "fast",
        calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 1300, modeledTdeeKcal: 1300 },
      }),
    );
    expect(result.recommendedCalories!).toBeGreaterThanOrEqual(0);
  });

  it("protection contre une recommandation extrême — TDEE bas, rythme agressif", () => {
    const result = computeCalorieStrategy(
      baseInput({
        weightKg: 90,
        rate: "fast",
        calibration: { ...MODEL_ONLY, adaptiveTdeeKcal: 1700, modeledTdeeKcal: 1700 },
      }),
    );
    // Le déficit brut poids×rythme dépasserait largement le plancher — le
    // moteur ne doit jamais renvoyer aveuglément une valeur trop basse.
    expect(result.recommendedCalories!).toBeGreaterThanOrEqual(
      CALORIE_STRATEGY_GUARDRAILS.ABSOLUTE_MIN_FLOOR_KCAL,
    );
    expect(result.limited).toBe(true);
  });
});

describe("computeCalorieStrategy — autonomie Cortex-native", () => {
  it("fonctionne uniquement à partir de la calibration Cortex (poids Cortex + TDEE Cortex), sans source externe", () => {
    const result = computeCalorieStrategy(baseInput({ weightKg: 78, rate: "moderate" }));
    expect(result.recommendedCalories).not.toBeNull();
  });
});

describe("computeCalorieStrategy — cohérence des rythmes centralisés", () => {
  it("les rythmes de perte sont strictement croissants (slow < moderate < fast)", () => {
    const { slow, moderate, fast } = CALORIE_STRATEGY_RATES.fat_loss;
    expect(slow.weeklyBodyWeightPercent).toBeLessThan(moderate.weeklyBodyWeightPercent);
    expect(moderate.weeklyBodyWeightPercent).toBeLessThan(fast.weeklyBodyWeightPercent);
  });

  it("les rythmes de prise sont strictement croissants et plus conservateurs que la perte", () => {
    const { slow, moderate } = CALORIE_STRATEGY_RATES.muscle_gain;
    expect(slow.weeklyBodyWeightPercent).toBeLessThan(moderate.weeklyBodyWeightPercent);
    expect(moderate.weeklyBodyWeightPercent).toBeLessThan(
      CALORIE_STRATEGY_RATES.fat_loss.moderate.weeklyBodyWeightPercent,
    );
  });
});

const NOW = "2026-08-08T12:00:00.000Z";
const autoBase = (overrides: Partial<AutoCalorieAdjustmentInput>): AutoCalorieAdjustmentInput => ({
  mode: "automatic",
  currentCalories: 2000,
  recommendedCalories: 2150,
  calibrationState: "adapted",
  lastAutoAdjustmentAt: null,
  now: NOW,
  ...overrides,
});

describe("evaluateAutoCalorieAdjustment — mode manuel", () => {
  it("mode manual → refus (manual_mode), jamais éligible", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({ mode: "manual" }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["manual_mode"]);
    expect(result.proposedCalories).toBeNull();
  });
});

describe("evaluateAutoCalorieAdjustment — mode automatique, cas de base", () => {
  it("mode automatic avec toutes les conditions réunies → éligible", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({}));
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual(["eligible"]);
    expect(result.proposedCalories).not.toBeNull();
  });

  it("recommandation absente → non exploitable", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({ recommendedCalories: null }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["recommendation_unavailable"]);
  });

  it("objectif actuel absent → non exploitable", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({ currentCalories: null }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["current_goal_unavailable"]);
  });

  it("différence sous le seuil minimal → within_tolerance, aucun ajustement", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 2100, recommendedCalories: 2125 }),
    );
    expect(Math.abs(2125 - 2100)).toBeLessThan(
      AUTO_CALORIE_ADJUSTMENT_CONFIG.MIN_AUTO_ADJUSTMENT_KCAL,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["within_tolerance"]);
  });

  it("différence au-dessus du seuil → éligible", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 2000, recommendedCalories: 2100 }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoCalorieAdjustment — cooldown", () => {
  it("cooldown actif (dernier ajustement il y a 2 jours) → refus", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ lastAutoAdjustmentAt: "2026-08-06T12:00:00.000Z" }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["cooldown_active"]);
  });

  it("cooldown terminé (dernier ajustement il y a 8 jours) → éligible", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ lastAutoAdjustmentAt: "2026-07-31T12:00:00.000Z" }),
    );
    expect(result.eligible).toBe(true);
  });

  it("cooldown exactement à la limite (7 jours pile) → éligible (>= seuil)", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ lastAutoAdjustmentAt: "2026-08-01T12:00:00.000Z" }),
    );
    expect(result.eligible).toBe(true);
  });

  it("premier ajustement (lastAutoAdjustmentAt = null) → jamais bloqué par le cooldown", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({ lastAutoAdjustmentAt: null }));
    expect(result.eligible).toBe(true);
    expect(result.reasons).not.toContain("cooldown_active");
  });
});

describe("evaluateAutoCalorieAdjustment — amplitude selon calibration", () => {
  it("model_only → step le plus conservateur", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({
        currentCalories: 2000,
        recommendedCalories: 2500,
        calibrationState: "model_only",
      }),
    );
    expect(result.eligible).toBe(true);
    expect(Math.abs(result.proposedCalories! - 2000)).toBeLessThanOrEqual(
      AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL.model_only + 25,
    );
  });

  it("calibrating → step intermédiaire", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({
        currentCalories: 2000,
        recommendedCalories: 2500,
        calibrationState: "calibrating",
      }),
    );
    expect(Math.abs(result.proposedCalories! - 2000)).toBeLessThanOrEqual(
      AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL.calibrating + 25,
    );
  });

  it("adapted → step le plus large", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 2000, recommendedCalories: 2500, calibrationState: "adapted" }),
    );
    expect(Math.abs(result.proposedCalories! - 2000)).toBeLessThanOrEqual(
      AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL.adapted + 25,
    );
  });

  it("les steps sont strictement croissants model_only < calibrating < adapted", () => {
    const { model_only, calibrating, adapted } = AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL;
    expect(model_only).toBeLessThan(calibrating);
    expect(calibrating).toBeLessThan(adapted);
  });
});

describe("evaluateAutoCalorieAdjustment — direction et respect du plafond", () => {
  it("hausse (recommended > current) — exemple du brief : 2000 → 2300, step 100 → proposé 2100", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({
        currentCalories: 2000,
        recommendedCalories: 2300,
        calibrationState: "calibrating",
      }),
    );
    expect(AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL.calibrating).toBe(100);
    expect(result.proposedCalories).toBe(2100);
  });

  it("baisse (recommended < current) — exemple du brief : 2200 → 1900, step 100 → proposé 2100", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({
        currentCalories: 2200,
        recommendedCalories: 1900,
        calibrationState: "calibrating",
      }),
    );
    expect(result.proposedCalories).toBe(2100);
  });

  it("énorme divergence — le pas maximal reste respecté, jamais un saut direct vers la recommandation", () => {
    const result = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 1800, recommendedCalories: 3500, calibrationState: "adapted" }),
    );
    expect(result.proposedCalories).not.toBe(3500);
    expect(Math.abs(result.proposedCalories! - 1800)).toBeLessThanOrEqual(
      AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL.adapted + 25,
    );
  });

  it("ne dépasse jamais la recommandation, quel que soit le sens", () => {
    const up = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 2000, recommendedCalories: 2050, calibrationState: "adapted" }),
    );
    expect(up.proposedCalories!).toBeLessThanOrEqual(2050 + 12.5);

    const down = evaluateAutoCalorieAdjustment(
      autoBase({ currentCalories: 2050, recommendedCalories: 2000, calibrationState: "adapted" }),
    );
    expect(down.proposedCalories!).toBeGreaterThanOrEqual(2000 - 12.5);
  });

  it("le proposé respecte la règle d'arrondi à 25 kcal", () => {
    const result = evaluateAutoCalorieAdjustment(autoBase({}));
    expect(result.proposedCalories! % 25).toBe(0);
  });
});
