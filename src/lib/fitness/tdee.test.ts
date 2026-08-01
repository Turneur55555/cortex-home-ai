import { describe, expect, it } from "vitest";
import { computeCalorieGoalGap, computeDailyTDEE, type TDEEInput } from "./tdee";

const complete: TDEEInput = {
  bmr: 1650,
  neat: { kcal: 410, method: "cortex_native" },
  eatKcal: 350,
  tefKcal: 210,
};

describe("computeDailyTDEE — agrégation", () => {
  it("additionne les 4 composantes (BMR 1650, NEAT 410, EAT 350, TEF 210 → TDEE 2620)", () => {
    const result = computeDailyTDEE(complete);
    expect(result.status).toBe("complete");
    expect(result.totalKcal).toBe(2620);
    expect(result.components).toEqual({ bmr: 1650, neat: 410, eat: 350, tef: 210 });
  });

  it("un jour sans séance donne EAT = 0, une vraie valeur, pas une donnée manquante", () => {
    const result = computeDailyTDEE({ ...complete, eatKcal: 0 });
    expect(result.status).toBe("complete");
    expect(result.components.eat).toBe(0);
    expect(result.totalKcal).toBe(2270);
  });

  it("gère les valeurs décimales et arrondit le total", () => {
    const result = computeDailyTDEE({
      bmr: 1650.4,
      neat: { kcal: 409.6, method: "cortex_native" },
      eatKcal: 350.2,
      tefKcal: 209.9,
    });
    expect(result.status).toBe("complete");
    expect(result.totalKcal).toBe(Math.round(1650.4 + 409.6 + 350.2 + 209.9));
  });
});

describe("computeDailyTDEE — données manquantes", () => {
  it("BMR absent → incomplete, totalKcal null, jamais un total partiel", () => {
    const result = computeDailyTDEE({ ...complete, bmr: null });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it("NEAT absent (méthode insuffisante) → incomplete, totalKcal null", () => {
    const result = computeDailyTDEE({
      ...complete,
      neat: { kcal: null, method: "insufficient_data" },
    });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).toBeNull();
  });

  it("EAT réellement à 0 n'est jamais traité comme une donnée manquante", () => {
    const result = computeDailyTDEE({ ...complete, eatKcal: 0 });
    expect(result.status).toBe("complete");
    expect(result.components.eat).toBe(0);
  });

  it("TEF réellement à 0 n'est jamais traité comme une donnée manquante", () => {
    const result = computeDailyTDEE({ ...complete, tefKcal: 0 });
    expect(result.status).toBe("complete");
    expect(result.components.tef).toBe(0);
  });

  it("plusieurs composantes absentes simultanément → incomplete", () => {
    const result = computeDailyTDEE({
      bmr: null,
      neat: { kcal: null, method: "insufficient_data" },
      eatKcal: 0,
      tefKcal: 0,
    });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).toBeNull();
    expect(result.components).toEqual({ bmr: null, neat: null, eat: 0, tef: 0 });
  });

  it("ne transforme jamais silencieusement une composante inconnue en 0 dans le total (exemple du brief)", () => {
    const result = computeDailyTDEE({
      bmr: 1650,
      neat: { kcal: null, method: "insufficient_data" },
      eatKcal: 300,
      tefKcal: 200,
    });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).not.toBe(2150);
    expect(result.totalKcal).toBeNull();
  });
});

describe("computeDailyTDEE — robustesse", () => {
  it("ignore un BMR négatif en le ramenant à 0, pas d'exception", () => {
    const result = computeDailyTDEE({ ...complete, bmr: -100 });
    expect(result.status).toBe("complete");
    expect(result.components.bmr).toBe(0);
  });

  it("traite NaN comme une donnée manquante (jamais propagé dans le total)", () => {
    const result = computeDailyTDEE({ ...complete, bmr: Number.NaN });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).toBeNull();
  });

  it("traite Infinity comme une donnée manquante (jamais propagé dans le total)", () => {
    const result = computeDailyTDEE({
      ...complete,
      neat: { kcal: Number.POSITIVE_INFINITY, method: "cortex_native" },
    });
    expect(result.status).toBe("incomplete");
    expect(result.totalKcal).toBeNull();
  });

  it("EAT/TEF négatifs ou non-finis sont ramenés à 0 sans casser l'agrégation", () => {
    const result = computeDailyTDEE({ ...complete, eatKcal: -50, tefKcal: Number.NaN });
    expect(result.status).toBe("complete");
    expect(result.components.eat).toBe(0);
    expect(result.components.tef).toBe(0);
  });
});

describe("computeDailyTDEE — autonomie Cortex-native", () => {
  it("calcule un TDEE complet sans Apple Health/Garmin/Whoop/Fitbit — uniquement BMR profil + NEAT déclaratif + EAT/TEF Cortex", () => {
    const result = computeDailyTDEE({
      bmr: 1600,
      neat: { kcal: 400, method: "cortex_native" },
      eatKcal: 0,
      tefKcal: 150,
    });
    expect(result.status).toBe("complete");
    expect(result.totalKcal).toBe(2150);
    expect(result.confidence).toBe("medium");
  });
});

describe("computeDailyTDEE — cohérence", () => {
  it("totalKcal égale la somme arrondie des composantes quand complet", () => {
    const result = computeDailyTDEE(complete);
    expect(result.status).toBe("complete");
    const { bmr, neat, eat, tef } = result.components;
    expect(result.totalKcal).toBe(Math.round((bmr ?? 0) + (neat ?? 0) + eat + tef));
  });
});

describe("computeDailyTDEE — confiance", () => {
  it("NEAT mesuré via wearable (active_calories - EAT) → confiance high", () => {
    const result = computeDailyTDEE({
      ...complete,
      neat: { kcal: 410, method: "wearable_active_calories" },
    });
    expect(result.confidence).toBe("high");
  });

  it("NEAT Cortex-native (profil déclaratif) → confiance medium", () => {
    const result = computeDailyTDEE({ ...complete, neat: { kcal: 410, method: "cortex_native" } });
    expect(result.confidence).toBe("medium");
  });

  it("NEAT estimé à partir des pas → confiance low", () => {
    const result = computeDailyTDEE({ ...complete, neat: { kcal: 410, method: "steps_estimate" } });
    expect(result.confidence).toBe("low");
  });
});

describe("computeCalorieGoalGap", () => {
  it("calcule l'écart cible objectif − TDEE (exemple du brief : TDEE 2600, objectif 2100 → -500)", () => {
    expect(computeCalorieGoalGap(2600, 2100)).toEqual({ gapKcal: -500 });
  });

  it("surplus cible quand l'objectif dépasse le TDEE", () => {
    expect(computeCalorieGoalGap(2000, 2300)).toEqual({ gapKcal: 300 });
  });

  it("retourne null si le TDEE est incomplet (null)", () => {
    expect(computeCalorieGoalGap(null, 2100)).toBeNull();
  });

  it("retourne null si aucun objectif calorique n'est défini", () => {
    expect(computeCalorieGoalGap(2600, null)).toBeNull();
    expect(computeCalorieGoalGap(2600, undefined)).toBeNull();
  });

  it("retourne null si l'objectif n'est pas un nombre fini", () => {
    expect(computeCalorieGoalGap(2600, Number.NaN)).toBeNull();
  });
});
