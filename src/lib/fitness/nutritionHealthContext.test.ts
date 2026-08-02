import { describe, expect, it } from "vitest";
import {
  buildNutritionHealthAnalysisContext,
  parseNutritionHealthAnalysisResult,
} from "./nutritionHealthContext";

function baseInput() {
  return {
    bmrKcal: 1650,
    neatKcal: 400,
    eatKcal: 300,
    tefKcal: 150,
    tdeeModeledKcal: 2500,
    tdeeObservedKcal: 2480,
    tdeeObservedStatus: "established" as const,
    tdeeObservedConfidence: "high" as const,
    tdeeAdaptiveKcal: 2490,
    calibrationState: "adapted" as const,
    divergenceSuspected: false,

    caloriesConsumedTodayKcal: 1800,
    calorieGoalKcal: 2250,
    calorieRecommendationKcal: 2250,
    calorieMode: "manual" as const,
    proteinsCurrentG: 160,
    carbsCurrentG: 200,
    fatsCurrentG: 70,
    proteinsRecommendedG: 160,
    carbsRecommendedG: 200,
    fatsRecommendedG: 70,
    proteinBasis: "body_weight" as const,
    macroMode: "manual" as const,
    proteinLocked: false,
    carbsLocked: false,
    fatLocked: false,

    bodyComposition: null,
    physicalGoal: null,
    progress: null,
  };
}

describe("buildNutritionHealthAnalysisContext — assemblage déterministe (§24)", () => {
  it("données complètes (métabolisme/nutrition) → aucun flag métabolisme/nutrition, valeurs reprises telles quelles (jamais recalculées)", () => {
    const ctx = buildNutritionHealthAnalysisContext(baseInput());
    expect(ctx.dataQuality.flags).not.toContain("bmr_missing");
    expect(ctx.dataQuality.flags).not.toContain("calorie_goal_missing");
    expect(ctx.dataQuality.flags).not.toContain("tdee_observed_insufficient_data");
    expect(ctx.metabolism.bmrKcal).toBe(1650);
    expect(ctx.metabolism.tdeeAdaptiveKcal).toBe(2490);
    expect(ctx.nutrition.calorieGoalKcal).toBe(2250);
    // Aucune transformation numérique — le contexte est un pur pass-through.
    expect(ctx.nutrition.proteinsRecommendedG).toBe(baseInput().proteinsRecommendedG);
  });

  it("données partielles (BMR manquant) → flag explicite, jamais une valeur inventée", () => {
    const ctx = buildNutritionHealthAnalysisContext({ ...baseInput(), bmrKcal: null });
    expect(ctx.metabolism.bmrKcal).toBeNull();
    expect(ctx.dataQuality.flags).toContain("bmr_missing");
  });

  it("aucune composition corporelle → bodyComposition null + flag dédié", () => {
    const ctx = buildNutritionHealthAnalysisContext(baseInput());
    expect(ctx.bodyComposition).toBeNull();
    expect(ctx.dataQuality.flags).toContain("body_composition_missing");
  });

  it("photo low confidence → flag body_composition_low_confidence, jamais transformée en fait certain", () => {
    const ctx = buildNutritionHealthAnalysisContext({
      ...baseInput(),
      bodyComposition: {
        weightKg: 80,
        weightSmoothedKg: 79.8,
        bodyFatPercent: 18,
        bodyFatMinPercent: 16,
        bodyFatMaxPercent: 20,
        bodyFatMethod: "photo_estimate",
        bodyFatConfidence: "low",
        leanMassKg: 65.6,
        fatMassKg: 14.4,
        measurementAgeDays: 2,
        dataQuality: "low_confidence",
      },
    });
    expect(ctx.bodyComposition?.bodyFatMethod).toBe("photo_estimate");
    expect(ctx.bodyComposition?.dataQuality).toBe("low_confidence");
    expect(ctx.dataQuality.flags).toContain("body_composition_low_confidence");
  });

  it("composition corporelle fiable (DEXA) → pas de flag low_confidence", () => {
    const ctx = buildNutritionHealthAnalysisContext({
      ...baseInput(),
      bodyComposition: {
        weightKg: 80,
        weightSmoothedKg: 79.8,
        bodyFatPercent: 18,
        bodyFatMinPercent: null,
        bodyFatMaxPercent: null,
        bodyFatMethod: "dexa",
        bodyFatConfidence: "high",
        leanMassKg: 65.6,
        fatMassKg: 14.4,
        measurementAgeDays: 5,
        dataQuality: "high_confidence",
      },
    });
    expect(ctx.dataQuality.flags).not.toContain("body_composition_low_confidence");
  });

  it.each(["model_only", "calibrating", "adapted"] as const)(
    "calibration TDEE %s reprise telle quelle",
    (state) => {
      const ctx = buildNutritionHealthAnalysisContext({ ...baseInput(), calibrationState: state });
      expect(ctx.metabolism.calibrationState).toBe(state);
      if (state === "model_only") {
        expect(ctx.dataQuality.flags).toContain("tdee_adaptive_not_calibrated");
      } else {
        expect(ctx.dataQuality.flags).not.toContain("tdee_adaptive_not_calibrated");
      }
    },
  );

  it("divergence TDEE suspectée → flag transmis tel quel, sans diagnostic ajouté par ce module (le diagnostic reste interdit à l'IA, pas à ce fichier)", () => {
    const ctx = buildNutritionHealthAnalysisContext({ ...baseInput(), divergenceSuspected: true });
    expect(ctx.metabolism.divergenceSuspected).toBe(true);
    expect(ctx.dataQuality.flags).toContain("tdee_divergence_suspected");
  });

  it.each(["on_track", "ahead", "behind", "maintaining", "insufficient_data"] as const)(
    "état de progression %s repris tel quel",
    (state) => {
      const ctx = buildNutritionHealthAnalysisContext({ ...baseInput(), progress: { state } });
      expect(ctx.progress?.state).toBe(state);
      if (state === "insufficient_data") {
        expect(ctx.dataQuality.flags).toContain("progress_insufficient_data");
      }
    },
  );

  it("manuel/automatique — calories et macros repris indépendamment, jamais fusionnés", () => {
    const ctx = buildNutritionHealthAnalysisContext({
      ...baseInput(),
      calorieMode: "automatic",
      macroMode: "manual",
    });
    expect(ctx.automation.calorieMode).toBe("automatic");
    expect(ctx.automation.macroMode).toBe("manual");
  });

  it("locks — transmis tels quels, jamais réinterprétés", () => {
    const ctx = buildNutritionHealthAnalysisContext({
      ...baseInput(),
      proteinLocked: true,
      carbsLocked: false,
      fatLocked: true,
    });
    expect(ctx.nutrition.proteinLocked).toBe(true);
    expect(ctx.nutrition.carbsLocked).toBe(false);
    expect(ctx.nutrition.fatLocked).toBe(true);
  });

  it("absence d'objectif physique → physicalGoal null + flag dédié, jamais fabriqué", () => {
    const ctx = buildNutritionHealthAnalysisContext(baseInput());
    expect(ctx.physicalGoal).toBeNull();
    expect(ctx.dataQuality.flags).toContain("physical_goal_missing");
  });

  it("§22 — aucun champ nom/email/id/chemin/photo n'existe dans le contexte produit", () => {
    const ctx = buildNutritionHealthAnalysisContext(baseInput());
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/email|@|password|user_id|storage|\.jpg|\.png/i);
  });
});

describe("parseNutritionHealthAnalysisResult — réponse provider invalide (§24)", () => {
  it("réponse bien formée → acceptée", () => {
    const result = parseNutritionHealthAnalysisResult({
      headline: "Tout est conforme",
      summary: "Résumé de la situation actuelle.",
      status: "good",
      insights: [
        {
          type: "progress",
          title: "Progression",
          explanation: "Conforme au rythme.",
          severity: "info",
        },
      ],
      nextSteps: ["Continue comme ça."],
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe("good");
  });

  it("champ manquant → null, jamais une structure partielle affichée", () => {
    expect(parseNutritionHealthAnalysisResult({ headline: "X" })).toBeNull();
  });

  it("status hors énumération → null", () => {
    expect(
      parseNutritionHealthAnalysisResult({
        headline: "X",
        summary: "Y",
        status: "excellent",
        insights: [],
        nextSteps: [],
      }),
    ).toBeNull();
  });

  it("insights mal formés (severity invalide) → null", () => {
    expect(
      parseNutritionHealthAnalysisResult({
        headline: "X",
        summary: "Y",
        status: "good",
        insights: [{ type: "a", title: "b", explanation: "c", severity: "critical" }],
        nextSteps: [],
      }),
    ).toBeNull();
  });

  it("null/undefined/tableau/string → null, jamais une exception non gérée", () => {
    expect(parseNutritionHealthAnalysisResult(null)).toBeNull();
    expect(parseNutritionHealthAnalysisResult(undefined)).toBeNull();
    expect(parseNutritionHealthAnalysisResult([])).toBeNull();
    expect(parseNutritionHealthAnalysisResult("not an object")).toBeNull();
  });

  it("trop d'insights/nextSteps → null (protection contre une réponse anormalement volumineuse)", () => {
    const manyInsights = Array.from({ length: 10 }, (_, i) => ({
      type: `t${i}`,
      title: "x",
      explanation: "y",
      severity: "info" as const,
    }));
    expect(
      parseNutritionHealthAnalysisResult({
        headline: "X",
        summary: "Y",
        status: "good",
        insights: manyInsights,
        nextSteps: [],
      }),
    ).toBeNull();
  });
});
