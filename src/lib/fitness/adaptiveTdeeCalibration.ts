// Pure domain logic for la calibration du TDEE ADAPTATIF — Phase 3B de la
// refonte Santé nutritionnelle. No React, no Supabase, no UI tokens.
//
// Cortex possède désormais trois notions distinctes de dépense énergétique,
// qui doivent TOUJOURS rester séparées et jamais fusionnées silencieusement :
//  - TDEE MODÉLISÉ  (lib/fitness/tdee.ts)         : BMR + NEAT + EAT + TEF.
//  - TDEE OBSERVÉ    (lib/fitness/adaptiveTdee.ts) : déduit statistiquement
//    des calories réellement loggées + de la tendance de poids réelle.
//  - TDEE ADAPTATIF  (ce fichier)                  : combinaison prudente
//    des deux précédents — la meilleure estimation personnalisée que Cortex
//    peut proposer aujourd'hui, SANS jamais remplacer brutalement le modèle
//    par l'observation.
//
// Le TDEE observé contient encore du bruit (pesée, tracking alimentaire
// incomplet, approximation KCAL_PER_KG, données manquantes) : il sert donc
// de SIGNAL DE CALIBRATION, jamais de vérité absolue. Cette phase ne modifie
// AUCUN objectif calorique, AUCUNE macro, et ne pose AUCUN diagnostic
// d'« adaptation métabolique » — un écart modèle/observé peut avoir de
// nombreuses causes (tracking incomplet, rétention d'eau, période atypique).

import type { AdaptiveTdeeConfidence, AdaptiveTdeeStatus } from "./adaptiveTdee";

// ---------------------------------------------------------------------
// Constantes centralisées
// ---------------------------------------------------------------------

/**
 * Poids attribué au signal OBSERVÉ dans la combinaison
 * `adaptive = modeled × (1 - weight) + observed × weight`, selon la
 * fiabilité de l'observation (réutilise `AdaptiveTdeeStatus`/
 * `AdaptiveTdeeConfidence` de la Phase 3A — pas de deuxième notion de
 * confiance). Coefficients volontairement CONSERVATEURS : `weight < 1`
 * dans tous les cas, même en confiance "high" — le modèle physiologique
 * reste une ancre, jamais totalement écarté. `insufficient_data` est
 * toujours à 0 (géré explicitement avant consultation de cette table, mais
 * présent ici pour que le type reste exhaustif).
 */
export const ADAPTIVE_TDEE_CALIBRATION_WEIGHTS: Record<
  AdaptiveTdeeStatus,
  Record<AdaptiveTdeeConfidence, number>
> = {
  insufficient_data: { low: 0, medium: 0, high: 0 },
  early_estimate: { low: 0.15, medium: 0.15, high: 0.15 },
  established: { low: 0.3, medium: 0.35, high: 0.5 },
};

export const ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS = {
  /** Correction maximale absolue, en kcal — garde-fou #1. */
  MAX_CORRECTION_KCAL: 400,
  /** Correction maximale relative, en fraction du TDEE modélisé — garde-fou #2. */
  MAX_CORRECTION_PERCENT: 0.15,
  /**
   * Au-delà de cet écart relatif |observé − modélisé| / modélisé, l'écart
   * est traité comme suspect (tracking incomplet, rétention d'eau, période
   * atypique…) plutôt que comme un signal fiable de recalibration — le
   * poids appliqué est réduit AVANT même d'atteindre le plafond kcal/% ci-
   * dessus (double protection).
   */
  DIVERGENCE_SUSPECT_PERCENT: 0.25,
  /** Facteur appliqué au poids observé quand une divergence est suspecte. */
  DIVERGENCE_DAMPING_FACTOR: 0.5,
} as const;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type AdaptiveTdeeCalibrationState = "model_only" | "calibrating" | "adapted";

export interface AdaptiveTdeeCalibrationInput {
  /** TDEE modélisé du jour (computeDailyTDEE(...).totalKcal). Ancre de tout le calcul. */
  modeledTdeeKcal: number | null;
  /** TDEE observé (computeAdaptiveTdee(...).observedTdeeKcal). */
  observedTdeeKcal: number | null;
  /** computeAdaptiveTdee(...).status — réutilisé tel quel. */
  observedStatus: AdaptiveTdeeStatus;
  /** computeAdaptiveTdee(...).confidence — réutilisé tel quel. */
  observedConfidence: AdaptiveTdeeConfidence | null;
}

export interface AdaptiveTdeeCalibrationResult {
  state: AdaptiveTdeeCalibrationState;
  /** `null` UNIQUEMENT si `modeledTdeeKcal` est indisponible/invalide (aucune ancre fiable). */
  adaptiveTdeeKcal: number | null;
  modeledTdeeKcal: number | null;
  observedTdeeKcal: number | null;
  /** Poids RÉELLEMENT appliqué à l'observé (après amortissement de divergence éventuel) — toujours < 1. */
  observedWeight: number;
  /** observé − modélisé, avant pondération/plafond. `null` si l'observé n'est pas exploitable. */
  rawDeltaKcal: number | null;
  /** Correction signée réellement appliquée au modèle (après pondération ET plafond). */
  appliedCorrectionKcal: number;
  /** `true` si |rawDeltaKcal|/modeledTdeeKcal dépasse DIVERGENCE_SUSPECT_PERCENT. */
  divergenceSuspected: boolean;
  /** Confiance de l'observation utilisée (pass-through de la Phase 3A) — `null` si non applicable. */
  confidence: AdaptiveTdeeConfidence | null;
  /** Explication courte, humaine, de l'état et de la correction retenue. */
  reason: string;
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

function isValidTdeeKcal(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------

/**
 * TDEE ADAPTATIF = `modeled × (1 − weight) + observed × weight`, exprimé de
 * façon équivalente ici comme `modeled + appliedCorrection` (plus explicite
 * pour l'UI — voir §17 : "Ajustement appliqué"). `weight` dépend de l'état
 * et de la confiance de l'observation (Phase 3A), toujours < 1, et amorti
 * si l'écart modèle/observé est suspect (voir `DIVERGENCE_SUSPECT_PERCENT`).
 * La correction finale est en plus plafonnée en valeur absolue ET relative
 * (le plus conservateur des deux) : un écart aberrant (ex. observé très
 * supérieur au modèle) ne peut jamais faire dériver le résultat près de
 * l'observation brute — voir les tests "divergence aberrante".
 *
 * N'AUTO-CORRIGE RIEN d'autre : ni le TDEE modélisé affiché comme référence,
 * ni `nutrition_goals.calories`, ni les macros. Purement informatif/estimatif.
 */
export function computeAdaptiveTdeeCalibration(
  input: AdaptiveTdeeCalibrationInput,
): AdaptiveTdeeCalibrationResult {
  const modeledTdeeKcal = isValidTdeeKcal(input.modeledTdeeKcal) ? input.modeledTdeeKcal : null;

  if (modeledTdeeKcal == null) {
    return {
      state: "model_only",
      adaptiveTdeeKcal: null,
      modeledTdeeKcal: null,
      observedTdeeKcal: null,
      observedWeight: 0,
      rawDeltaKcal: null,
      appliedCorrectionKcal: 0,
      divergenceSuspected: false,
      confidence: null,
      reason:
        "TDEE modélisé indisponible — impossible de produire un TDEE adaptatif sans cette ancre.",
    };
  }

  const observedTdeeKcal = isValidTdeeKcal(input.observedTdeeKcal) ? input.observedTdeeKcal : null;
  const observedConfidence = input.observedConfidence;
  const observedUsable =
    observedTdeeKcal != null &&
    input.observedStatus !== "insufficient_data" &&
    observedConfidence != null;

  if (!observedUsable) {
    return {
      state: "model_only",
      adaptiveTdeeKcal: modeledTdeeKcal,
      modeledTdeeKcal,
      observedTdeeKcal,
      observedWeight: 0,
      rawDeltaKcal: null,
      appliedCorrectionKcal: 0,
      divergenceSuspected: false,
      confidence: null,
      reason:
        "Pas encore assez de données observées — le TDEE adaptatif reste égal au TDEE modélisé (modèle initial).",
    };
  }

  const {
    DIVERGENCE_SUSPECT_PERCENT,
    DIVERGENCE_DAMPING_FACTOR,
    MAX_CORRECTION_KCAL,
    MAX_CORRECTION_PERCENT,
  } = ADAPTIVE_TDEE_CALIBRATION_THRESHOLDS;

  const baseWeight = ADAPTIVE_TDEE_CALIBRATION_WEIGHTS[input.observedStatus][observedConfidence];
  const rawDeltaKcal = Math.round(observedTdeeKcal - modeledTdeeKcal);
  const divergencePercent = Math.abs(rawDeltaKcal) / modeledTdeeKcal;
  const divergenceSuspected = divergencePercent > DIVERGENCE_SUSPECT_PERCENT;
  const observedWeight = divergenceSuspected ? baseWeight * DIVERGENCE_DAMPING_FACTOR : baseWeight;

  const maxCorrectionKcal = Math.min(MAX_CORRECTION_KCAL, modeledTdeeKcal * MAX_CORRECTION_PERCENT);
  const appliedCorrectionKcal = Math.round(
    clamp(rawDeltaKcal * observedWeight, -maxCorrectionKcal, maxCorrectionKcal),
  );
  const adaptiveTdeeKcal = Math.round(modeledTdeeKcal + appliedCorrectionKcal);

  const state: AdaptiveTdeeCalibrationState =
    input.observedStatus === "established" ? "adapted" : "calibrating";

  const reason = divergenceSuspected
    ? `Écart important entre modèle et observation (${Math.round(divergencePercent * 100)} %) — signal traité avec prudence (poids réduit, correction plafonnée à ${Math.round(maxCorrectionKcal)} kcal).`
    : `${state === "adapted" ? "Historique suffisamment fiable" : "Calibration en cours"} — correction de ${appliedCorrectionKcal >= 0 ? "+" : ""}${appliedCorrectionKcal} kcal appliquée au modèle (poids observé ${Math.round(observedWeight * 100)} %).`;

  return {
    state,
    adaptiveTdeeKcal,
    modeledTdeeKcal,
    observedTdeeKcal,
    observedWeight: Math.round(observedWeight * 1000) / 1000,
    rawDeltaKcal,
    appliedCorrectionKcal,
    divergenceSuspected,
    confidence: input.observedConfidence,
    reason,
  };
}
