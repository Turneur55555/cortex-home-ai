// Pure domain logic — TRAJECTOIRE d'un objectif physique (Phase 8). No
// React, no Supabase, no UI tokens.
//
// Réutilise EXACTEMENT la définition du rythme de `calorieStrategy.ts`
// (`CALORIE_STRATEGY_RATES`, % du poids CORPOREL COURANT par semaine) —
// aucun second système de coefficients (§9/§11 du brief). Comme le rythme
// est un pourcentage du poids COURANT (pas du poids de départ figé), une
// projection linéaire naïve (`poids initial × % × N semaines`) sous-
// estimerait la durée réelle : le nombre de kg perdus/pris chaque semaine
// diminue/augmente avec le poids lui-même. `computeGoalTrajectory` modélise
// donc une évolution composée (même principe qu'un taux d'intérêt
// composé), cohérente avec la manière dont `computeCalorieStrategy`
// recalcule le déficit/surplus contre le poids courant à chaque appel —
// jamais une ligne droite persistée.

import {
  CALORIE_STRATEGY_RATES,
  type CalorieStrategyGoal,
  type FatLossRate,
  type MuscleGainRate,
} from "./calorieStrategy";
import { computeLeanMass, isValidBodyFatPercent, type ConfidenceLevel } from "./bodyComposition";

/**
 * Zone de maintien (§12 du brief) : demi-largeur en % du poids de
 * référence, en dessous de laquelle une variation de poids ne doit pas
 * être interprétée comme un échec du maintien. Règle produit PRUDENTE
 * (pas une certitude scientifique), centralisée et documentée — même
 * esprit que `PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT` (Phase 6C) ou
 * `BODY_COMPOSITION_MAX_AGE_DAYS` (Phase 7).
 */
export const MAINTENANCE_ZONE_PERCENT = 1.5;

export type GoalTrajectoryStatus = "ok" | "unavailable" | "already_at_target";

/** En-dessous de cet écart (kg), la cible est considérée atteinte — évite un statut "ok" avec une durée de 0 semaine pour un écart déjà nul. */
const AT_TARGET_EPSILON_KG = 0.2;

export interface MaintenanceZone {
  minKg: number;
  maxKg: number;
}

export interface GoalTrajectoryResult {
  status: GoalTrajectoryStatus;
  /** Kg par semaine au poids ACTUEL — signé (négatif = perte). Recalculé, jamais une valeur figée à la création de l'objectif. `null` pour `maintenance` (voir `maintenanceZoneKg`) ou si aucun rythme/poids exploitable. */
  weeklyTargetChangeKg: number | null;
  /**
   * Durée estimée en semaines pour atteindre `targetWeightKg` — modèle
   * composé (voir en-tête du fichier), jamais une projection linéaire.
   * `null` si `targetWeightKg` est absent (§3/§30 : Cortex fonctionne
   * sans cible précise) ou non calculable.
   */
  estimatedDurationWeeks: number | null;
  /** Date ISO estimée — TOUJOURS à présenter comme une estimation, jamais une promesse (§39 du brief). `null` si `estimatedDurationWeeks` est `null`. */
  estimatedTargetDate: string | null;
  /** Uniquement pour `maintenance` (§12/§44). */
  maintenanceZoneKg: MaintenanceZone | null;
}

function isValidPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function rateDefinitionFor(
  goal: CalorieStrategyGoal,
  rate: FatLossRate | MuscleGainRate | null,
): { weeklyBodyWeightPercent: number } | null {
  if (rate == null) return null;
  if (goal === "fat_loss" && rate in CALORIE_STRATEGY_RATES.fat_loss) {
    return CALORIE_STRATEGY_RATES.fat_loss[rate as FatLossRate];
  }
  if (goal === "muscle_gain" && rate in CALORIE_STRATEGY_RATES.muscle_gain) {
    return CALORIE_STRATEGY_RATES.muscle_gain[rate as MuscleGainRate];
  }
  return null;
}

function unavailable(maintenanceZoneKg: MaintenanceZone | null = null): GoalTrajectoryResult {
  return {
    status: "unavailable",
    weeklyTargetChangeKg: null,
    estimatedDurationWeeks: null,
    estimatedTargetDate: null,
    maintenanceZoneKg,
  };
}

/**
 * Trajectoire d'un objectif physique — orchestre uniquement les
 * définitions déjà existantes (`CALORIE_STRATEGY_RATES`), ne recrée aucun
 * moteur calorique/TDEE (§28/§29 du brief : hors scope, Phase 8 ne calcule
 * QUE le poids, jamais les calories).
 */
export function computeGoalTrajectory(input: {
  goal: CalorieStrategyGoal;
  targetRate: FatLossRate | MuscleGainRate | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  todayIso: string;
}): GoalTrajectoryResult {
  if (input.goal === "maintenance") {
    if (!isValidPositive(input.currentWeightKg)) return unavailable();
    const halfWidthKg = input.currentWeightKg * (MAINTENANCE_ZONE_PERCENT / 100);
    return {
      status: "ok",
      weeklyTargetChangeKg: null,
      estimatedDurationWeeks: null,
      estimatedTargetDate: null,
      maintenanceZoneKg: {
        minKg: Math.round((input.currentWeightKg - halfWidthKg) * 10) / 10,
        maxKg: Math.round((input.currentWeightKg + halfWidthKg) * 10) / 10,
      },
    };
  }

  if (!isValidPositive(input.currentWeightKg)) return unavailable();
  const rateDef = rateDefinitionFor(input.goal, input.targetRate);
  if (rateDef == null) return unavailable();

  const signedPercent =
    (input.goal === "fat_loss" ? -1 : 1) * (rateDef.weeklyBodyWeightPercent / 100);
  const weeklyTargetChangeKg = Math.round(input.currentWeightKg * signedPercent * 100) / 100;

  if (input.targetWeightKg == null) {
    return {
      status: "ok",
      weeklyTargetChangeKg,
      estimatedDurationWeeks: null,
      estimatedTargetDate: null,
      maintenanceZoneKg: null,
    };
  }
  if (!isValidPositive(input.targetWeightKg)) return unavailable();

  const remainingKg = input.targetWeightKg - input.currentWeightKg;
  if (Math.abs(remainingKg) <= AT_TARGET_EPSILON_KG) {
    return {
      status: "already_at_target",
      weeklyTargetChangeKg,
      estimatedDurationWeeks: 0,
      estimatedTargetDate: input.todayIso,
      maintenanceZoneKg: null,
    };
  }

  // Modèle composé : w(t) = w0 · (1 + signedPercent)^t → t = ln(target/w0) / ln(1 + signedPercent).
  // `1 + signedPercent` est toujours dans ]0, 2[ pour des rythmes réalistes
  // (jamais ≥100%/semaine) donc `ln` est défini ; protégé explicitement.
  const ratio = input.targetWeightKg / input.currentWeightKg;
  const base = 1 + signedPercent;
  if (ratio <= 0 || base <= 0 || base === 1) return unavailable();
  const weeks = Math.log(ratio) / Math.log(base);
  if (!Number.isFinite(weeks) || weeks <= 0) return unavailable();

  const estimatedDurationWeeks = Math.round(weeks);
  const estimatedDate = new Date(`${input.todayIso}T00:00:00Z`);
  estimatedDate.setUTCDate(estimatedDate.getUTCDate() + estimatedDurationWeeks * 7);

  return {
    status: "ok",
    weeklyTargetChangeKg,
    estimatedDurationWeeks,
    estimatedTargetDate: estimatedDate.toISOString().slice(0, 10),
    maintenanceZoneKg: null,
  };
}

// ---------------------------------------------------------------------
// Projection Body Fat cible — TOUJOURS théorique (§13/§14/§15 du brief)
// ---------------------------------------------------------------------

export type BodyFatProjectionStatus = "ok" | "unavailable" | "invalid_goal";

export interface BodyFatTargetProjection {
  status: BodyFatProjectionStatus;
  /** Poids théorique si la masse maigre actuelle était parfaitement conservée — `leanMassKg / (1 - targetBF/100)`. JAMAIS le poids futur exact (§14/§15). */
  projectedWeightAtTargetBFKg: number | null;
  currentFatMassKg: number | null;
  currentLeanMassKg: number | null;
  /** Confiance de la composition corporelle actuelle utilisée — reprend `ConfidenceLevel` existant (Phase 6A), jamais un pourcentage inventé (§16). */
  confidence: ConfidenceLevel | null;
  /** Toujours `true` — sert de garde-fou UI pour ne jamais présenter la valeur comme une certitude. */
  isTheoretical: true;
}

function unavailableBodyFatProjection(
  status: BodyFatProjectionStatus = "unavailable",
): BodyFatTargetProjection {
  return {
    status,
    projectedWeightAtTargetBFKg: null,
    currentFatMassKg: null,
    currentLeanMassKg: null,
    confidence: null,
    isTheoretical: true,
  };
}

/**
 * Poids théorique à Body Fat cible — projection À MASSE MAIGRE CONSTANTE
 * (hypothèse explicitement documentée, jamais garantie réelle, §13). Refuse
 * proprement (`invalid_goal`) toute projection qui produirait un poids
 * négatif/infini/NaN (§15).
 */
export function computeBodyFatTargetProjection(input: {
  currentWeightKg: number | null;
  currentBodyFatPercent: number | null;
  targetBodyFatPercent: number | null;
  confidence: ConfidenceLevel | null;
}): BodyFatTargetProjection {
  if (input.targetBodyFatPercent == null) return unavailableBodyFatProjection();
  if (!isValidBodyFatPercent(input.targetBodyFatPercent)) {
    return unavailableBodyFatProjection("invalid_goal");
  }
  if (
    !isValidPositive(input.currentWeightKg) ||
    !isValidBodyFatPercent(input.currentBodyFatPercent)
  ) {
    return unavailableBodyFatProjection();
  }

  const currentLeanMassKg = computeLeanMass(input.currentWeightKg, input.currentBodyFatPercent);
  const currentFatMassKg =
    currentLeanMassKg != null
      ? Math.round((input.currentWeightKg - currentLeanMassKg) * 10) / 10
      : null;
  if (currentLeanMassKg == null) return unavailableBodyFatProjection();

  const divisor = 1 - input.targetBodyFatPercent / 100;
  if (divisor <= 0) return unavailableBodyFatProjection("invalid_goal");

  const projectedWeightAtTargetBFKg = currentLeanMassKg / divisor;
  if (!Number.isFinite(projectedWeightAtTargetBFKg) || projectedWeightAtTargetBFKg <= 0) {
    return unavailableBodyFatProjection("invalid_goal");
  }

  return {
    status: "ok",
    projectedWeightAtTargetBFKg: Math.round(projectedWeightAtTargetBFKg * 10) / 10,
    currentFatMassKg,
    currentLeanMassKg: Math.round(currentLeanMassKg * 10) / 10,
    confidence: input.confidence,
    isTheoretical: true,
  };
}
