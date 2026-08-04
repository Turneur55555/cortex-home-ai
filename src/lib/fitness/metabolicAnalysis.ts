// Pure presentation-layer logic for the "Analyse métabolique" Sheet — Phase
// 3C de la refonte Santé nutritionnelle. No React, no Supabase, no UI tokens
// (className, JSX…) : ce fichier assemble un OBJET STRUCTURÉ prêt à
// afficher à partir des résultats déjà calculés par les moteurs existants
// (tdee.ts Phase 2E, adaptiveTdee.ts Phase 3A, adaptiveTdeeCalibration.ts
// Phase 3B). Il ne recalcule AUCUNE formule métabolique — uniquement du
// formatage/libellé/agrégation d'affichage.

import type { DailyTDEE } from "./tdee";
import {
  ADAPTIVE_TDEE_THRESHOLDS,
  type AdaptiveTdeeConfidence,
  type AdaptiveTdeeResult,
} from "./adaptiveTdee";
import type {
  AdaptiveTdeeCalibrationResult,
  AdaptiveTdeeCalibrationState,
} from "./adaptiveTdeeCalibration";

// ---------------------------------------------------------------------
// Libellés centralisés — un seul point de vérité pour ce vocabulaire,
// jamais dupliqué dans le composant.
// ---------------------------------------------------------------------

/**
 * Copie associée à chaque niveau de confiance — un indicateur RELATIF de
 * qualité des données, jamais un pourcentage scientifique (ex. "95 %
 * fiable" est explicitement interdit par le brief Phase 3C §9).
 */
export const CONFIDENCE_COPY: Record<
  AdaptiveTdeeConfidence,
  { label: string; description: string }
> = {
  low: {
    label: "Faible",
    description:
      "Peu de données disponibles pour l'instant — l'estimation reste encore incertaine.",
  },
  medium: {
    label: "Moyenne",
    description: "Historique correct, mais encore limité en durée ou en couverture des données.",
  },
  high: {
    label: "Élevée",
    description:
      "Historique suffisamment long avec une bonne couverture des pesées et de la nutrition.",
  },
};

export const CALIBRATION_STATE_COPY: Record<AdaptiveTdeeCalibrationState, string> = {
  model_only: "Modèle initial",
  calibrating: "Calibration en cours",
  adapted: "Calibré",
};

/** Pourquoi la correction n'est jamais totale — voir Phase 3C §11, jamais présenté comme une vérité absolue. */
export const CALIBRATION_PARTIAL_CORRECTION_EXPLANATION =
  "Cortex ajuste progressivement l'estimation pour éviter de réagir aux fluctuations temporaires du poids ou aux journées alimentaires atypiques.";

/** Divergence suspecte — informatif, ne diagnostique AUCUNE cause (Phase 3C §12). */
export const DIVERGENCE_SUSPECTED_EXPLANATION =
  "La différence entre le modèle et les données observées est importante. Cortex limite temporairement l'ajustement tant que davantage de données ne confirment pas la tendance.";

const MODELED_COMPONENT_LABELS: Record<
  keyof DailyTDEE["components"],
  { label: string; acronym: string }
> = {
  bmr: { label: "Métabolisme de base", acronym: "BMR" },
  neat: { label: "Activité quotidienne", acronym: "NEAT" },
  eat: { label: "Entraînement", acronym: "EAT" },
  tef: { label: "Digestion", acronym: "TEF" },
};

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface ModeledComponentRow {
  key: keyof DailyTDEE["components"];
  label: string;
  acronym: string;
  /** `null` uniquement pour `bmr`/`neat` si non calculables — jamais fabriqué à 0. */
  kcal: number | null;
}

export interface ModeledAnalysis {
  status: DailyTDEE["status"];
  totalKcal: number | null;
  components: ModeledComponentRow[];
}

/** Progression vers un TDEE observé "établi" — critères, jamais une date fabriquée (Phase 3C §7). */
export interface CalibrationProgressCriterion {
  current: number;
  required: number;
}

export interface CalibrationProgress {
  weighIns: CalibrationProgressCriterion;
  nutritionCoveragePercent: CalibrationProgressCriterion;
  calendarDays: CalibrationProgressCriterion;
}

export type ObservedAnalysis =
  | {
      available: false;
      reason: string;
      progress: CalibrationProgress;
    }
  | {
      available: true;
      windowDays: number;
      measurementCount: number;
      nutritionCoveragePercent: number;
      averageCaloriesKcal: number | null;
      weeklyTrendKgPerWeek: number | null;
      observedTdeeKcal: number;
      confidence: { label: string; description: string };
    };

export interface CalibrationAnalysis {
  state: AdaptiveTdeeCalibrationState;
  stateLabel: string;
  adaptiveTdeeKcal: number | null;
  modeledTdeeKcal: number | null;
  observedTdeeKcal: number | null;
  rawDeltaKcal: number | null;
  appliedCorrectionKcal: number;
  divergenceSuspected: boolean;
  /** Texte explicatif à afficher — soit l'explication "correction jamais totale", soit celle de divergence suspecte. */
  explanation: string;
}

export interface MetabolicAnalysisViewModel {
  modeled: ModeledAnalysis;
  observed: ObservedAnalysis;
  calibration: CalibrationAnalysis;
  /** Objectif calorique déclaré (nutrition_goals.calories) — affiché séparément, jamais confondu avec une dépense. */
  calorieGoalKcal: number | null;
}

export interface MetabolicAnalysisInput {
  dailyTDEE: DailyTDEE;
  adaptiveTdee: AdaptiveTdeeResult;
  calibration: AdaptiveTdeeCalibrationResult;
  calorieGoalKcal: number | null;
}

// ---------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------

/** Arrondit une fraction [0,1] en pourcentage entier — ex. 0.862 → 86. */
export function formatPercent(fraction: number): number {
  return Math.round(fraction * 100);
}

/** Ex. 70 → "+70 kcal", -70 → "-70 kcal", 0 → "0 kcal". */
export function formatSignedKcal(value: number): string {
  if (value === 0) return "0 kcal";
  return `${value > 0 ? "+" : ""}${value} kcal`;
}

// ---------------------------------------------------------------------
// Construction du modèle de vue
// ---------------------------------------------------------------------

function buildModeledAnalysis(dailyTDEE: DailyTDEE): ModeledAnalysis {
  const componentKeys: Array<keyof DailyTDEE["components"]> = ["bmr", "neat", "eat", "tef"];
  return {
    status: dailyTDEE.status,
    totalKcal: dailyTDEE.totalKcal,
    components: componentKeys.map((key) => ({
      key,
      label: MODELED_COMPONENT_LABELS[key].label,
      acronym: MODELED_COMPONENT_LABELS[key].acronym,
      kcal: dailyTDEE.components[key],
    })),
  };
}

function buildCalibrationProgress(adaptiveTdee: AdaptiveTdeeResult): CalibrationProgress {
  const { ESTABLISHED } = ADAPTIVE_TDEE_THRESHOLDS;
  return {
    weighIns: {
      current: adaptiveTdee.weight.measurementCount,
      required: ESTABLISHED.MIN_WEIGHT_MEASUREMENTS,
    },
    nutritionCoveragePercent: {
      current: formatPercent(adaptiveTdee.nutrition.coverage),
      required: formatPercent(ESTABLISHED.MIN_NUTRITION_COVERAGE),
    },
    calendarDays: {
      current: adaptiveTdee.window.calendarDays,
      required: ESTABLISHED.MIN_CALENDAR_DAYS,
    },
  };
}

function buildObservedAnalysis(adaptiveTdee: AdaptiveTdeeResult): ObservedAnalysis {
  if (
    adaptiveTdee.status === "insufficient_data" ||
    adaptiveTdee.observedTdeeKcal == null ||
    adaptiveTdee.confidence == null
  ) {
    return {
      available: false,
      reason: adaptiveTdee.reason,
      progress: buildCalibrationProgress(adaptiveTdee),
    };
  }

  return {
    available: true,
    windowDays: adaptiveTdee.window.calendarDays,
    measurementCount: adaptiveTdee.weight.measurementCount,
    nutritionCoveragePercent: formatPercent(adaptiveTdee.nutrition.coverage),
    averageCaloriesKcal: adaptiveTdee.nutrition.averageCalories,
    weeklyTrendKgPerWeek: adaptiveTdee.weight.weeklyTrendKg,
    observedTdeeKcal: adaptiveTdee.observedTdeeKcal,
    confidence: CONFIDENCE_COPY[adaptiveTdee.confidence],
  };
}

function buildCalibrationAnalysis(calibration: AdaptiveTdeeCalibrationResult): CalibrationAnalysis {
  return {
    state: calibration.state,
    stateLabel: CALIBRATION_STATE_COPY[calibration.state],
    adaptiveTdeeKcal: calibration.adaptiveTdeeKcal,
    modeledTdeeKcal: calibration.modeledTdeeKcal,
    observedTdeeKcal: calibration.observedTdeeKcal,
    rawDeltaKcal: calibration.rawDeltaKcal,
    appliedCorrectionKcal: calibration.appliedCorrectionKcal,
    divergenceSuspected: calibration.divergenceSuspected,
    explanation: calibration.divergenceSuspected
      ? DIVERGENCE_SUSPECTED_EXPLANATION
      : CALIBRATION_PARTIAL_CORRECTION_EXPLANATION,
  };
}

/**
 * Assemble le modèle de vue complet de la Sheet "Analyse métabolique" à
 * partir des résultats déjà calculés par les moteurs Cortex existants.
 * Aucune formule métabolique n'est recalculée ici.
 */
export function buildMetabolicAnalysis(input: MetabolicAnalysisInput): MetabolicAnalysisViewModel {
  return {
    modeled: buildModeledAnalysis(input.dailyTDEE),
    observed: buildObservedAnalysis(input.adaptiveTdee),
    calibration: buildCalibrationAnalysis(input.calibration),
    calorieGoalKcal: input.calorieGoalKcal,
  };
}
