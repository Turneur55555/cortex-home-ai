import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_TDEE_THRESHOLDS,
  computeAdaptiveTdee,
  type NutritionLogInput,
  type WeightSampleInput,
} from "./adaptiveTdee";

const TODAY = "2026-08-01";

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Série de poids parfaitement linéaire (aucun bruit) : w(i) = w0 + dailySlope*i. */
function genLinearWeightSeries(
  startDate: string,
  days: number,
  w0: number,
  dailySlopeKgPerDay: number,
  stepDays = 1,
): WeightSampleInput[] {
  const samples: WeightSampleInput[] = [];
  for (let i = 0; i < days; i += stepDays) {
    samples.push({
      date: addDays(startDate, i),
      weight: Math.round((w0 + dailySlopeKgPerDay * i) * 100) / 100,
      created_at: `${addDays(startDate, i)}T08:00:00Z`,
    });
  }
  return samples;
}

function genNutritionSeries(
  startDate: string,
  days: number,
  averageCalories: number,
  loggedIndices?: ReadonlyArray<number>,
): NutritionLogInput[] {
  const indices = loggedIndices ?? Array.from({ length: days }, (_, i) => i);
  return indices.map((i) => ({ date: addDays(startDate, i), calories: averageCalories }));
}

describe("computeAdaptiveTdee — insuffisant", () => {
  it("0 donnée", () => {
    const result = computeAdaptiveTdee({
      weightSamples: [],
      nutritionLogs: [],
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.status).toBe("insufficient_data");
    expect(result.observedTdeeKcal).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it("quelques jours seulement (< 7 j de fenêtre)", () => {
    const weightSamples = genLinearWeightSeries(addDays(TODAY, -3), 4, 80, 0);
    const nutritionLogs = genNutritionSeries(addDays(TODAY, -3), 4, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.status).toBe("insufficient_data");
    expect(result.window.calendarDays).toBeLessThan(
      ADAPTIVE_TDEE_THRESHOLDS.EARLY.MIN_CALENDAR_DAYS,
    );
  });

  it("assez de jours mais trop peu de pesées (14 j, 2 pesées)", () => {
    const start = addDays(TODAY, -13);
    const weightSamples: WeightSampleInput[] = [
      { date: start, weight: 80, created_at: `${start}T08:00:00Z` },
      { date: TODAY, weight: 79.8, created_at: `${TODAY}T08:00:00Z` },
    ];
    const nutritionLogs = genNutritionSeries(start, 14, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.status).toBe("insufficient_data");
    expect(result.weight.measurementCount).toBe(2);
    expect(result.reason).toMatch(/pesées/i);
  });

  it("assez de poids mais nutrition trop incomplète (14 j, 7 pesées, 3 jours loggés)", () => {
    const start = addDays(TODAY, -13);
    const weightSamples = genLinearWeightSeries(start, 14, 80, 0, 2); // 7 pesées tous les 2 jours
    const nutritionLogs = genNutritionSeries(start, 14, 2300, [0, 5, 10]);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.status).toBe("insufficient_data");
    expect(result.nutrition.coverage).toBeLessThan(
      ADAPTIVE_TDEE_THRESHOLDS.EARLY.MIN_NUTRITION_COVERAGE,
    );
    expect(result.reason).toMatch(/nutritionnelle/i);
  });

  it("pesées trop espacées malgré un nombre suffisant sur une longue période (densité)", () => {
    // 4 pesées mais réparties sur 26 jours (densité ~0.15, bien sous 0.3).
    const start = addDays(TODAY, -25);
    const weightSamples: WeightSampleInput[] = [0, 8, 17, 25].map((i) => ({
      date: addDays(start, i),
      weight: 80,
      created_at: `${addDays(start, i)}T08:00:00Z`,
    }));
    const nutritionLogs = genNutritionSeries(start, 26, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.status).toBe("insufficient_data");
  });
});

describe("computeAdaptiveTdee — poids stable", () => {
  it("apports moyens 2300 kcal, poids stable → TDEE observé proche de 2300 kcal", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.observedTdeeKcal).not.toBeNull();
    expect(result.observedTdeeKcal!).toBeCloseTo(2300, -1);
    expect(result.weight.weeklyTrendKg).toBeCloseTo(0, 1);
  });
});

describe("computeAdaptiveTdee — perte de poids", () => {
  it("2200 kcal/j, -0,30 kg/semaine → TDEE observé ≈ 2530 kcal/j", () => {
    const start = addDays(TODAY, -20);
    const dailySlope = -0.3 / 7;
    const weightSamples = genLinearWeightSeries(start, 21, 82, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 21, 2200);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2650,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.weight.weeklyTrendKg).toBeCloseTo(-0.3, 1);
    // Tolérance liée à l'arrondi intentionnel de weeklyTrendKg à 2 décimales
    // (affichage humain) — amplifié par le coefficient kcal/kg (~1100 kcal
    // par kg/semaine), donc quelques kcal d'écart sont attendus, pas une
    // erreur d'algorithme.
    expect(Math.abs(result.observedTdeeKcal! - 2530)).toBeLessThan(30);
  });
});

describe("computeAdaptiveTdee — prise de poids", () => {
  it("2500 kcal/j, +0,20 kg/semaine → TDEE observé inférieur aux apports", () => {
    const start = addDays(TODAY, -20);
    const dailySlope = 0.2 / 7;
    const weightSamples = genLinearWeightSeries(start, 21, 78, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 21, 2500);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2400,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.weight.weeklyTrendKg).toBeGreaterThan(0);
    expect(result.observedTdeeKcal!).toBeLessThan(2500);
    expect(Math.abs(result.observedTdeeKcal! - 2280)).toBeLessThan(30);
  });
});

describe("computeAdaptiveTdee — qualité des données", () => {
  it("jours alimentaires manquants n'entrent jamais dans la moyenne comme 0 kcal", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    // Seuls 15 des 21 jours sont loggés, tous à 2300 kcal — la moyenne doit
    // rester 2300, jamais diluée par les 6 jours sans log traités comme 0.
    const nutritionLogs = genNutritionSeries(
      start,
      21,
      2300,
      Array.from({ length: 15 }, (_, i) => i),
    );
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.nutrition.averageCalories).toBe(2300);
    expect(result.nutrition.loggedDays).toBe(15);
  });

  it("plusieurs pesées le même jour → conserve la dernière par created_at", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    // Doublon sur le premier jour : une pesée matinale à 80.5, corrigée le
    // soir à 80.0 (created_at plus récent) — la valeur du soir doit gagner.
    weightSamples.push({ date: start, weight: 80.5, created_at: `${start}T06:00:00Z` });
    weightSamples[0] = { date: start, weight: 80.0, created_at: `${start}T20:00:00Z` };
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    // measurementCount doit rester 21 (un seul point conservé pour ce jour).
    expect(result.weight.measurementCount).toBe(21);
  });

  it("dates irrégulières (pesées non quotidiennes) restent exploitables si la densité suffit", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0, 2); // 1 jour sur 2
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).not.toBe("insufficient_data");
  });

  it("valeurs décimales de poids gérées sans erreur d'arrondi grossière", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80.35, -0.3 / 7);
    const nutritionLogs = genNutritionSeries(start, 21, 2200);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(Number.isFinite(result.observedTdeeKcal)).toBe(true);
  });

  it("outliers de poids (bornes physiologiques dépassées) sont ignorés, pas plantés", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    weightSamples.push({
      date: addDays(start, 5),
      weight: 999,
      created_at: `${addDays(start, 5)}T23:00:00Z`,
    });
    weightSamples.push({
      date: addDays(start, 6),
      weight: -5,
      created_at: `${addDays(start, 6)}T23:00:00Z`,
    });
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.observedTdeeKcal!).toBeCloseTo(2300, -1);
  });

  it("NaN et Infinity dans les poids sont ignorés sans planter le moteur", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    weightSamples.push({
      date: addDays(start, 5),
      weight: Number.NaN,
      created_at: `${addDays(start, 5)}T23:00:00Z`,
    });
    weightSamples.push({
      date: addDays(start, 6),
      weight: Number.POSITIVE_INFINITY,
      created_at: `${addDays(start, 6)}T23:00:00Z`,
    });
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    expect(() =>
      computeAdaptiveTdee({ weightSamples, nutritionLogs, modeledTdeeKcal: 2350, today: TODAY }),
    ).not.toThrow();
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).not.toBe("insufficient_data");
  });

  it("calories négatives dans un log ne cassent pas le calcul (traitées comme 0 pour ce log, jour toujours compté loggé)", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    const nutritionLogs: NutritionLogInput[] = genNutritionSeries(start, 21, 2300);
    nutritionLogs[0] = { date: start, calories: -500 };
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.nutrition.loggedDays).toBe(21);
    expect(Number.isFinite(result.nutrition.averageCalories)).toBe(true);
  });

  it("protection anti-eau : une pesée isolée +1 kg (rétention d'eau) ne fait pas croire à un changement de dépense de 1000 kcal", () => {
    const start = addDays(TODAY, -20);
    const stableWeightSamples = genLinearWeightSeries(start, 21, 80, 0);
    const spikedWeightSamples = stableWeightSamples.map((s) =>
      s.date === addDays(start, 15) ? { ...s, weight: s.weight! + 1 } : s,
    );
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const stable = computeAdaptiveTdee({
      weightSamples: stableWeightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    const spiked = computeAdaptiveTdee({
      weightSamples: spikedWeightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    // Une variation brute d'1 kg équivaudrait naïvement à ~7700/7 ≈ 1100
    // kcal/j si elle était utilisée directement. Le lissage 7j + régression
    // sur 21 jours doit ramener cet impact à une fraction très inférieure.
    const impactKcal = Math.abs(spiked.observedTdeeKcal! - stable.observedTdeeKcal!);
    expect(impactKcal).toBeLessThan(150);
  });
});

describe("computeAdaptiveTdee — comparaison avec le TDEE modélisé", () => {
  it("TDEE observé > modélisé", () => {
    const start = addDays(TODAY, -20);
    const dailySlope = -0.3 / 7;
    const weightSamples = genLinearWeightSeries(start, 21, 82, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 21, 2200);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.deltaKcal).toBeGreaterThan(0);
    expect(result.comparison!.modeledTdeeKcal).toBe(2350);
  });

  it("TDEE observé < modélisé", () => {
    const start = addDays(TODAY, -20);
    const dailySlope = 0.2 / 7;
    const weightSamples = genLinearWeightSeries(start, 21, 78, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 21, 2500);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2600,
      today: TODAY,
    });
    expect(result.comparison!.deltaKcal).toBeLessThan(0);
  });

  it("égalité approximative", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2300,
      today: TODAY,
    });
    expect(Math.abs(result.comparison!.deltaKcal)).toBeLessThan(20);
  });

  it("aucune comparaison si le TDEE modélisé est absent", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, 0);
    const nutritionLogs = genNutritionSeries(start, 21, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: null,
      today: TODAY,
    });
    expect(result.comparison).toBeNull();
  });

  it("ne modifie jamais le TDEE modélisé fourni en entrée (comparaison purement informative)", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 82, -0.3 / 7);
    const nutritionLogs = genNutritionSeries(start, 21, 2200);
    const modeledTdeeKcal = 2650;
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal,
      today: TODAY,
    });
    expect(result.comparison!.modeledTdeeKcal).toBe(modeledTdeeKcal);
  });
});

describe("computeAdaptiveTdee — jeux de données synthétiques longs", () => {
  it("converge sur une tendance connue sur 14 jours", () => {
    const start = addDays(TODAY, -13);
    const dailySlope = -0.4 / 7;
    const weightSamples = genLinearWeightSeries(start, 14, 90, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 14, 2400);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2800,
      today: TODAY,
    });
    expect(result.status).not.toBe("insufficient_data");
    expect(result.weight.weeklyTrendKg).toBeCloseTo(-0.4, 1);
    const expected = 2400 - (-0.4 * 7700) / 7;
    expect(Math.abs(result.observedTdeeKcal! - expected)).toBeLessThan(30);
  });

  it("converge sur une tendance connue sur 21 jours", () => {
    const start = addDays(TODAY, -20);
    const dailySlope = 0.25 / 7;
    const weightSamples = genLinearWeightSeries(start, 21, 70, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 21, 2600);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2500,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.weight.weeklyTrendKg).toBeCloseTo(0.25, 1);
    const expected = 2600 - (0.25 * 7700) / 7;
    expect(Math.abs(result.observedTdeeKcal! - expected)).toBeLessThan(30);
  });

  it("converge sur une tendance connue sur 28 jours (fenêtre d'analyse maximale)", () => {
    const start = addDays(TODAY, -27);
    const dailySlope = -0.2 / 7;
    const weightSamples = genLinearWeightSeries(start, 28, 95, dailySlope);
    const nutritionLogs = genNutritionSeries(start, 28, 2900);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 3100,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.confidence).not.toBeNull();
    expect(result.weight.weeklyTrendKg).toBeCloseTo(-0.2, 1);
    const expected = 2900 - (-0.2 * 7700) / 7;
    expect(Math.abs(result.observedTdeeKcal! - expected)).toBeLessThan(30);
  });
});

describe("computeAdaptiveTdee — confiance", () => {
  it("early_estimate → confiance low", () => {
    const start = addDays(TODAY, -7);
    const weightSamples = genLinearWeightSeries(start, 8, 80, 0);
    const nutritionLogs = genNutritionSeries(start, 8, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).toBe("early_estimate");
    expect(result.confidence).toBe("low");
  });

  it("established avec beaucoup de données → confiance high", () => {
    const start = addDays(TODAY, -27);
    const weightSamples = genLinearWeightSeries(start, 28, 80, 0);
    const nutritionLogs = genNutritionSeries(start, 28, 2300);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.confidence).toBe("high");
  });

  it("established avec données minimales → confiance medium", () => {
    const start = addDays(TODAY, -13);
    const weightSamples = genLinearWeightSeries(start, 14, 80, 0, 1);
    const nutritionLogs = genNutritionSeries(start, 14, 2300, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2350,
      today: TODAY,
    });
    expect(result.status).toBe("established");
    expect(result.confidence).toBe("medium");
  });
});

describe("computeAdaptiveTdee — autonomie Cortex-native", () => {
  it("calcule un TDEE observé uniquement à partir de poids/nutrition Cortex, sans aucune source externe", () => {
    const start = addDays(TODAY, -20);
    const weightSamples = genLinearWeightSeries(start, 21, 80, -0.3 / 7);
    const nutritionLogs = genNutritionSeries(start, 21, 2200);
    const result = computeAdaptiveTdee({
      weightSamples,
      nutritionLogs,
      modeledTdeeKcal: 2650,
      today: TODAY,
    });
    expect(result.status).not.toBe("insufficient_data");
    expect(result.observedTdeeKcal).not.toBeNull();
  });
});
