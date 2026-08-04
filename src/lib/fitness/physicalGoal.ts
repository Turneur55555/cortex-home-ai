// Pure domain logic pour l'OBJECTIF PHYSIQUE — Phase 8. No React, no
// Supabase, no UI tokens.
//
// Doctrine (brief Phase 8, section OBJECTIF PRODUIT) : Phase 8 ORCHESTRE
// les moteurs existants (calorieStrategy.ts, macroStrategy.ts,
// adaptiveTdee.ts, bodyComposition.ts) — elle ne recrée ni un moteur TDEE,
// ni un moteur calorique, ni un moteur macros. `goal`/`target_rate`
// reprennent EXACTEMENT la taxonomie stable Phase 4 (`CalorieStrategyGoal`,
// `FatLossRate`/`MuscleGainRate`) — aucune deuxième taxonomie.
//
// Ce fichier couvre : validation d'un objectif (poids/BF cible facultatifs,
// détection de contradiction manifeste) et le type du snapshot de départ,
// figé à la création et jamais recalculé (§17 du brief).

import type { CalorieStrategyGoal, FatLossRate, MuscleGainRate } from "./calorieStrategy";
import { isValidBodyFatPercent, type BodyFatMethod } from "./bodyComposition";

export type PhysicalGoalStatus = "active" | "completed" | "cancelled";

export type TargetRate = FatLossRate | MuscleGainRate;

/** Bornes plausibles pour un poids corporel — mêmes bornes que `body_tracking.weight` (une seule définition dans le projet). */
export const PHYSICAL_GOAL_WEIGHT_RANGE = { MIN: 20, MAX: 500 } as const;

export interface PhysicalGoalStartingSnapshot {
  startedAt: string;
  startingWeightKg: number | null;
  startingBodyFatPercent: number | null;
  startingBodyFatMethod: BodyFatMethod | null;
  startingLeanMassKg: number | null;
}

export interface PhysicalGoalTargets {
  targetWeightKg: number | null;
  targetBodyFatPercent: number | null;
}

export interface PhysicalGoalInput {
  goal: CalorieStrategyGoal;
  targetRate: TargetRate | null;
  targets: PhysicalGoalTargets;
  starting: Pick<PhysicalGoalStartingSnapshot, "startingWeightKg" | "startingBodyFatPercent">;
}

export type PhysicalGoalValidationResult =
  | { status: "valid" }
  | { status: "invalid"; reasons: string[] };

function isValidWeight(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= PHYSICAL_GOAL_WEIGHT_RANGE.MIN &&
    value <= PHYSICAL_GOAL_WEIGHT_RANGE.MAX
  );
}

function isKnownGoal(value: string): value is CalorieStrategyGoal {
  return value === "fat_loss" || value === "maintenance" || value === "muscle_gain";
}

/**
 * Valide un objectif physique AVANT toute persistance (§7 du brief).
 * Refuse proprement les données invalides et les contradictions
 * manifestes (ex. `fat_loss` avec un poids cible nettement supérieur au
 * poids de départ) — jamais silencieusement acceptées. Poids/BF cible
 * restent TOUJOURS facultatifs (§3/§4/§6) : `null` des deux côtés est
 * `"valid"`.
 */
export function validatePhysicalGoalInput(input: PhysicalGoalInput): PhysicalGoalValidationResult {
  const reasons: string[] = [];

  if (!isKnownGoal(input.goal)) {
    return { status: "invalid", reasons: ["Objectif inconnu."] };
  }

  // §9 : maintenance sans rythme ; fat_loss/muscle_gain avec le rythme
  // approprié à l'objectif — même contrainte que `nutrition_goals` (Phase 4).
  if (input.goal === "maintenance" && input.targetRate != null) {
    reasons.push("Le maintien ne prend pas de rythme.");
  }
  if (input.goal === "fat_loss" && input.targetRate != null) {
    if (!(["slow", "moderate", "fast"] as const).includes(input.targetRate as FatLossRate)) {
      reasons.push("Rythme invalide pour une perte de gras.");
    }
  }
  if (input.goal === "muscle_gain" && input.targetRate != null) {
    if (!(["slow", "moderate"] as const).includes(input.targetRate as MuscleGainRate)) {
      reasons.push("Rythme invalide pour une prise de muscle.");
    }
  }

  const { targetWeightKg, targetBodyFatPercent } = input.targets;
  const { startingWeightKg, startingBodyFatPercent } = input.starting;

  if (targetWeightKg != null) {
    if (!isValidWeight(targetWeightKg)) {
      reasons.push("Poids cible invalide.");
    } else if (startingWeightKg != null && isValidWeight(startingWeightKg)) {
      if (input.goal === "fat_loss" && targetWeightKg >= startingWeightKg) {
        reasons.push(
          "Un objectif de perte de gras nécessite un poids cible inférieur au poids de départ.",
        );
      }
      if (input.goal === "muscle_gain" && targetWeightKg <= startingWeightKg) {
        reasons.push(
          "Un objectif de prise de muscle nécessite un poids cible supérieur au poids de départ.",
        );
      }
    }
  }

  if (targetBodyFatPercent != null) {
    if (!isValidBodyFatPercent(targetBodyFatPercent)) {
      reasons.push("Body Fat cible invalide.");
    } else if (
      startingBodyFatPercent != null &&
      isValidBodyFatPercent(startingBodyFatPercent) &&
      input.goal === "fat_loss" &&
      targetBodyFatPercent >= startingBodyFatPercent
    ) {
      reasons.push(
        "Un objectif de perte de gras nécessite un Body Fat cible inférieur au Body Fat de départ.",
      );
    }
  }

  return reasons.length > 0 ? { status: "invalid", reasons } : { status: "valid" };
}
