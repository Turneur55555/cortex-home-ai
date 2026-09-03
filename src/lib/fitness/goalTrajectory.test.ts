import { describe, expect, it } from "vitest";
import { CALORIE_STRATEGY_RATES } from "./calorieStrategy";
import {
  computeBodyFatTargetProjection,
  computeGoalTrajectory,
  MAINTENANCE_ZONE_PERCENT,
} from "./goalTrajectory";

const TODAY = "2026-08-14";

describe("computeGoalTrajectory — rythmes perte (§48)", () => {
  it.each(["slow", "moderate", "fast"] as const)(
    "fat_loss %s → kg/semaine signé négatif, cohérent avec %% du poids courant",
    (rate) => {
      const result = computeGoalTrajectory({
        goal: "fat_loss",
        targetRate: rate,
        currentWeightKg: 80,
        targetWeightKg: null,
        todayIso: TODAY,
      });
      const expectedKg =
        -1 * 80 * (CALORIE_STRATEGY_RATES.fat_loss[rate].weeklyBodyWeightPercent / 100);
      expect(result.weeklyTargetChangeKg).toBeCloseTo(expectedKg, 2);
      expect(result.weeklyTargetChangeKg!).toBeLessThan(0);
    },
  );
});

describe("computeGoalTrajectory — rythmes prise (§48)", () => {
  it.each(["slow", "moderate"] as const)("muscle_gain %s → kg/semaine signé positif", (rate) => {
    const result = computeGoalTrajectory({
      goal: "muscle_gain",
      targetRate: rate,
      currentWeightKg: 70,
      targetWeightKg: null,
      todayIso: TODAY,
    });
    const expectedKg =
      70 * (CALORIE_STRATEGY_RATES.muscle_gain[rate].weeklyBodyWeightPercent / 100);
    expect(result.weeklyTargetChangeKg).toBeCloseTo(expectedKg, 2);
    expect(result.weeklyTargetChangeKg!).toBeGreaterThan(0);
  });
});

describe("computeGoalTrajectory — modèle composé, pas une projection linéaire naïve (§11/§48)", () => {
  it("durée cohérente avec le modèle composé w(t) = w0·(1+r)^t, pas w0 - kg/semaine × t", () => {
    const currentWeightKg = 90;
    const targetWeightKg = 80;
    const rate = "moderate" as const;
    const result = computeGoalTrajectory({
      goal: "fat_loss",
      targetRate: rate,
      currentWeightKg,
      targetWeightKg,
      todayIso: TODAY,
    });
    expect(result.status).toBe("ok");

    const signedPercent =
      -1 * (CALORIE_STRATEGY_RATES.fat_loss[rate].weeklyBodyWeightPercent / 100);
    const expectedWeeks = Math.round(
      Math.log(targetWeightKg / currentWeightKg) / Math.log(1 + signedPercent),
    );
    expect(result.estimatedDurationWeeks).toBe(expectedWeeks);

    // La projection linéaire naïve (poids initial × % × semaines) sous-estime
    // la durée réelle car le %/semaine s'applique à un poids qui diminue —
    // le modèle composé doit donc annoncer PLUS de semaines que le naïf.
    const weeklyKgAtStart = currentWeightKg * Math.abs(signedPercent);
    const naiveWeeks = Math.round((currentWeightKg - targetWeightKg) / weeklyKgAtStart);
    expect(result.estimatedDurationWeeks!).toBeGreaterThanOrEqual(naiveWeeks);
  });

  it("durée exprimée en semaines entières, date estimée cohérente (§10/§48)", () => {
    const result = computeGoalTrajectory({
      goal: "fat_loss",
      targetRate: "slow",
      currentWeightKg: 85,
      targetWeightKg: 80,
      todayIso: TODAY,
    });
    expect(Number.isInteger(result.estimatedDurationWeeks)).toBe(true);
    expect(result.estimatedTargetDate).not.toBeNull();
  });

  it("absence de cible précise → aucune durée/date, mais le rythme kg/semaine reste exposé (§3/§30/§48)", () => {
    const result = computeGoalTrajectory({
      goal: "fat_loss",
      targetRate: "moderate",
      currentWeightKg: 80,
      targetWeightKg: null,
      todayIso: TODAY,
    });
    expect(result.status).toBe("ok");
    expect(result.weeklyTargetChangeKg).not.toBeNull();
    expect(result.estimatedDurationWeeks).toBeNull();
    expect(result.estimatedTargetDate).toBeNull();
  });
});

describe("computeGoalTrajectory — maintien (§12/§44/§48)", () => {
  it("produit une zone de maintien autour du poids actuel, pas une durée/rythme", () => {
    const result = computeGoalTrajectory({
      goal: "maintenance",
      targetRate: null,
      currentWeightKg: 75,
      targetWeightKg: null,
      todayIso: TODAY,
    });
    expect(result.status).toBe("ok");
    expect(result.weeklyTargetChangeKg).toBeNull();
    expect(result.maintenanceZoneKg).not.toBeNull();
    const halfWidth = 75 * (MAINTENANCE_ZONE_PERCENT / 100);
    expect(result.maintenanceZoneKg!.minKg).toBeCloseTo(75 - halfWidth, 1);
    expect(result.maintenanceZoneKg!.maxKg).toBeCloseTo(75 + halfWidth, 1);
  });

  it("poids courant indisponible → unavailable", () => {
    const result = computeGoalTrajectory({
      goal: "maintenance",
      targetRate: null,
      currentWeightKg: null,
      targetWeightKg: null,
      todayIso: TODAY,
    });
    expect(result.status).toBe("unavailable");
  });
});

describe("computeGoalTrajectory — déjà à la cible / absence de rythme", () => {
  it("cible quasi-identique au poids actuel → already_at_target, durée 0", () => {
    const result = computeGoalTrajectory({
      goal: "fat_loss",
      targetRate: "moderate",
      currentWeightKg: 80,
      targetWeightKg: 79.9,
      todayIso: TODAY,
    });
    expect(result.status).toBe("already_at_target");
    expect(result.estimatedDurationWeeks).toBe(0);
  });

  it("rythme absent pour fat_loss/muscle_gain → unavailable", () => {
    const result = computeGoalTrajectory({
      goal: "fat_loss",
      targetRate: null,
      currentWeightKg: 80,
      targetWeightKg: 75,
      todayIso: TODAY,
    });
    expect(result.status).toBe("unavailable");
  });

  it("poids cible invalide (négatif/NaN) → unavailable", () => {
    for (const targetWeightKg of [-5, NaN]) {
      const result = computeGoalTrajectory({
        goal: "fat_loss",
        targetRate: "moderate",
        currentWeightKg: 80,
        targetWeightKg,
        todayIso: TODAY,
      });
      expect(result.status).toBe("unavailable");
    }
  });
});

describe("computeBodyFatTargetProjection — poids théorique à BF cible (§49)", () => {
  it("exemple travaillé : 80kg/20% BF → masse maigre 64kg, cible 15% → poids théorique ≈ 75.3kg", () => {
    const result = computeBodyFatTargetProjection({
      currentWeightKg: 80,
      currentBodyFatPercent: 20,
      targetBodyFatPercent: 15,
      confidence: "medium",
    });
    expect(result.status).toBe("ok");
    expect(result.currentLeanMassKg).toBeCloseTo(64, 1);
    expect(result.projectedWeightAtTargetBFKg).toBeCloseTo(64 / 0.85, 1);
    expect(result.isTheoretical).toBe(true);
  });

  it("§16 — confiance faible (photo low) propagée telle quelle, jamais un pourcentage inventé (§50)", () => {
    const result = computeBodyFatTargetProjection({
      currentWeightKg: 80,
      currentBodyFatPercent: 22,
      targetBodyFatPercent: 18,
      confidence: "low",
    });
    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("low");
  });

  it("aucune cible BF → unavailable, jamais une valeur fabriquée", () => {
    const result = computeBodyFatTargetProjection({
      currentWeightKg: 80,
      currentBodyFatPercent: 20,
      targetBodyFatPercent: null,
      confidence: "medium",
    });
    expect(result.status).toBe("unavailable");
    expect(result.projectedWeightAtTargetBFKg).toBeNull();
  });

  it("§15 — cible BF hors bornes → invalid_goal, jamais NaN/poids négatif", () => {
    const result = computeBodyFatTargetProjection({
      currentWeightKg: 80,
      currentBodyFatPercent: 20,
      targetBodyFatPercent: 95,
      confidence: "medium",
    });
    expect(result.status).toBe("invalid_goal");
    expect(result.projectedWeightAtTargetBFKg).toBeNull();
  });

  it("composition actuelle indisponible (poids/BF actuel manquant) → unavailable", () => {
    const result = computeBodyFatTargetProjection({
      currentWeightKg: null,
      currentBodyFatPercent: null,
      targetBodyFatPercent: 15,
      confidence: null,
    });
    expect(result.status).toBe("unavailable");
  });
});
