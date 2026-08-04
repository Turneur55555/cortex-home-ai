// Pure domain logic — contexte DÉTERMINISTE pour l'analyse intelligente
// Santé nutritionnelle (Phase 9A). No React, no Supabase, no network.
//
// Principe architectural absolu (brief Phase 9) :
//   Moteurs déterministes → structured facts → analyse/explication → utilisateur
// Ce fichier ne fait QUE l'étape "structured facts" : il assemble des
// valeurs DÉJÀ calculées par les moteurs existants (jamais recalculées
// ici) en un objet minimal, typé, et volontairement dépourvu de toute
// donnée personnelle (nom/email/id Supabase/chemins Storage/photos —
// aucun de ces champs n'existe dans ce type par construction, §22 du
// brief). L'IA ne reçoit jamais un dump de lignes Supabase brutes (§8).

import type { AdaptiveTdeeCalibrationState } from "./adaptiveTdeeCalibration";
import type { AdaptiveTdeeConfidence, AdaptiveTdeeStatus } from "./adaptiveTdee";
import type { CalorieStrategyGoal, FatLossRate, MuscleGainRate } from "./calorieStrategy";
import type { ProteinBasis } from "./macroStrategy";
import type { BodyFatMethod, ConfidenceLevel } from "./bodyComposition";
import type { GoalProgressState } from "./goalProgress";

/**
 * Qualité d'une donnée — permet à l'IA de distinguer "absence de donnée"
 * de "valeur zéro" (§7/§62 du brief), sans jamais halluciner pour combler
 * un trou.
 */
export type DataQuality =
  | "missing"
  | "insufficient_data"
  | "low_confidence"
  | "medium_confidence"
  | "high_confidence"
  | "stale";

export interface MetabolismFacts {
  bmrKcal: number | null;
  neatKcal: number | null;
  eatKcal: number | null;
  tefKcal: number | null;
  tdeeModeledKcal: number | null;
  tdeeObservedKcal: number | null;
  tdeeObservedStatus: AdaptiveTdeeStatus;
  tdeeObservedConfidence: AdaptiveTdeeConfidence | null;
  tdeeAdaptiveKcal: number | null;
  calibrationState: AdaptiveTdeeCalibrationState;
  divergenceSuspected: boolean;
}

export interface NutritionFacts {
  caloriesConsumedTodayKcal: number | null;
  calorieGoalKcal: number | null;
  calorieRecommendationKcal: number | null;
  calorieMode: "manual" | "automatic";
  proteinsCurrentG: number | null;
  carbsCurrentG: number | null;
  fatsCurrentG: number | null;
  proteinsRecommendedG: number | null;
  carbsRecommendedG: number | null;
  fatsRecommendedG: number | null;
  proteinBasis: ProteinBasis | null;
  macroMode: "manual" | "automatic";
  proteinLocked: boolean;
  carbsLocked: boolean;
  fatLocked: boolean;
}

export interface BodyCompositionFacts {
  weightKg: number | null;
  weightSmoothedKg: number | null;
  bodyFatPercent: number | null;
  bodyFatMinPercent: number | null;
  bodyFatMaxPercent: number | null;
  bodyFatMethod: BodyFatMethod | null;
  bodyFatConfidence: ConfidenceLevel | null;
  leanMassKg: number | null;
  fatMassKg: number | null;
  measurementAgeDays: number | null;
  dataQuality: DataQuality;
}

export interface PhysicalGoalFacts {
  goal: CalorieStrategyGoal;
  targetRate: FatLossRate | MuscleGainRate | null;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  startingBodyFatPercent: number | null;
  currentBodyFatPercent: number | null;
  targetBodyFatPercent: number | null;
  estimatedDurationWeeks: number | null;
}

export interface ProgressFacts {
  state: GoalProgressState;
}

export interface AutomationFacts {
  calorieMode: "manual" | "automatic";
  macroMode: "manual" | "automatic";
}

export interface DataQualityFacts {
  /** Étiquettes courtes signalant explicitement ce qui manque/est incertain — jamais deviné par l'IA (§7). */
  flags: string[];
}

export interface NutritionHealthAnalysisContext {
  metabolism: MetabolismFacts;
  nutrition: NutritionFacts;
  bodyComposition: BodyCompositionFacts | null;
  physicalGoal: PhysicalGoalFacts | null;
  progress: ProgressFacts | null;
  automation: AutomationFacts;
  dataQuality: DataQualityFacts;
}

/**
 * Assemble le contexte déterministe à partir de valeurs DÉJÀ calculées
 * par les moteurs existants (aucun recalcul ici, §3 du brief). Le
 * paramètre `input` est volontairement large et nommé pour matcher
 * directement les variables déjà présentes dans `sante-nutritionnelle.tsx`.
 */
export function buildNutritionHealthAnalysisContext(input: {
  bmrKcal: number | null;
  neatKcal: number | null;
  eatKcal: number | null;
  tefKcal: number | null;
  tdeeModeledKcal: number | null;
  tdeeObservedKcal: number | null;
  tdeeObservedStatus: AdaptiveTdeeStatus;
  tdeeObservedConfidence: AdaptiveTdeeConfidence | null;
  tdeeAdaptiveKcal: number | null;
  calibrationState: AdaptiveTdeeCalibrationState;
  divergenceSuspected: boolean;

  caloriesConsumedTodayKcal: number | null;
  calorieGoalKcal: number | null;
  calorieRecommendationKcal: number | null;
  calorieMode: "manual" | "automatic";
  proteinsCurrentG: number | null;
  carbsCurrentG: number | null;
  fatsCurrentG: number | null;
  proteinsRecommendedG: number | null;
  carbsRecommendedG: number | null;
  fatsRecommendedG: number | null;
  proteinBasis: ProteinBasis | null;
  macroMode: "manual" | "automatic";
  proteinLocked: boolean;
  carbsLocked: boolean;
  fatLocked: boolean;

  bodyComposition: BodyCompositionFacts | null;
  physicalGoal: PhysicalGoalFacts | null;
  progress: ProgressFacts | null;
}): NutritionHealthAnalysisContext {
  const flags: string[] = [];
  if (input.bmrKcal == null) flags.push("bmr_missing");
  if (input.tdeeObservedStatus === "insufficient_data")
    flags.push("tdee_observed_insufficient_data");
  if (input.calibrationState === "model_only") flags.push("tdee_adaptive_not_calibrated");
  if (input.divergenceSuspected) flags.push("tdee_divergence_suspected");
  if (input.calorieGoalKcal == null) flags.push("calorie_goal_missing");
  if (input.bodyComposition == null) flags.push("body_composition_missing");
  else if (input.bodyComposition.dataQuality === "low_confidence") {
    flags.push("body_composition_low_confidence");
  } else if (input.bodyComposition.dataQuality === "stale") {
    flags.push("body_composition_stale");
  }
  if (input.physicalGoal == null) flags.push("physical_goal_missing");
  if (input.progress?.state === "insufficient_data") flags.push("progress_insufficient_data");

  return {
    metabolism: {
      bmrKcal: input.bmrKcal,
      neatKcal: input.neatKcal,
      eatKcal: input.eatKcal,
      tefKcal: input.tefKcal,
      tdeeModeledKcal: input.tdeeModeledKcal,
      tdeeObservedKcal: input.tdeeObservedKcal,
      tdeeObservedStatus: input.tdeeObservedStatus,
      tdeeObservedConfidence: input.tdeeObservedConfidence,
      tdeeAdaptiveKcal: input.tdeeAdaptiveKcal,
      calibrationState: input.calibrationState,
      divergenceSuspected: input.divergenceSuspected,
    },
    nutrition: {
      caloriesConsumedTodayKcal: input.caloriesConsumedTodayKcal,
      calorieGoalKcal: input.calorieGoalKcal,
      calorieRecommendationKcal: input.calorieRecommendationKcal,
      calorieMode: input.calorieMode,
      proteinsCurrentG: input.proteinsCurrentG,
      carbsCurrentG: input.carbsCurrentG,
      fatsCurrentG: input.fatsCurrentG,
      proteinsRecommendedG: input.proteinsRecommendedG,
      carbsRecommendedG: input.carbsRecommendedG,
      fatsRecommendedG: input.fatsRecommendedG,
      proteinBasis: input.proteinBasis,
      macroMode: input.macroMode,
      proteinLocked: input.proteinLocked,
      carbsLocked: input.carbsLocked,
      fatLocked: input.fatLocked,
    },
    bodyComposition: input.bodyComposition,
    physicalGoal: input.physicalGoal,
    progress: input.progress,
    automation: {
      calorieMode: input.calorieMode,
      macroMode: input.macroMode,
    },
    dataQuality: { flags },
  };
}

// ---------------------------------------------------------------------
// Contrat de sortie — jamais du Markdown libre incontrôlé (§9 du brief)
// ---------------------------------------------------------------------

export type NutritionHealthAnalysisStatus = "good" | "attention" | "insufficient_data";
export type NutritionHealthInsightSeverity = "info" | "attention";

export interface NutritionHealthInsight {
  type: string;
  title: string;
  explanation: string;
  severity: NutritionHealthInsightSeverity;
}

export interface NutritionHealthAnalysisResult {
  headline: string;
  summary: string;
  status: NutritionHealthAnalysisStatus;
  insights: NutritionHealthInsight[];
  nextSteps: string[];
}

const MAX_INSIGHTS = 6;
const MAX_NEXT_STEPS = 4;
const MAX_TEXT_LENGTH = 600;

function isNonEmptyShortString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Validation défensive de la réponse du provider (§9/§18 : jamais du texte
 * libre non vérifié affiché tel quel). Retourne `null` si la forme ne
 * correspond pas exactement au contrat — l'appelant doit alors traiter
 * cela comme un échec (fallback sans IA, §19), jamais afficher une
 * structure partielle devinée.
 */
export function parseNutritionHealthAnalysisResult(
  raw: unknown,
): NutritionHealthAnalysisResult | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (!isNonEmptyShortString(r.headline, 120)) return null;
  if (!isNonEmptyShortString(r.summary)) return null;
  if (r.status !== "good" && r.status !== "attention" && r.status !== "insufficient_data")
    return null;
  if (!Array.isArray(r.insights) || r.insights.length > MAX_INSIGHTS) return null;
  if (!Array.isArray(r.nextSteps) || r.nextSteps.length > MAX_NEXT_STEPS) return null;

  const insights: NutritionHealthInsight[] = [];
  for (const raw_ of r.insights) {
    if (raw_ == null || typeof raw_ !== "object") return null;
    const i = raw_ as Record<string, unknown>;
    if (!isNonEmptyShortString(i.type, 60)) return null;
    if (!isNonEmptyShortString(i.title, 120)) return null;
    if (!isNonEmptyShortString(i.explanation)) return null;
    if (i.severity !== "info" && i.severity !== "attention") return null;
    insights.push({
      type: i.type,
      title: i.title,
      explanation: i.explanation,
      severity: i.severity,
    });
  }

  const nextSteps: string[] = [];
  for (const step of r.nextSteps) {
    if (!isNonEmptyShortString(step, 200)) return null;
    nextSteps.push(step);
  }

  return { headline: r.headline, summary: r.summary, status: r.status, insights, nextSteps };
}
