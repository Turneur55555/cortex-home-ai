// Pure domain logic for la recommandation de MACRONUTRIMENTS — Phase 5A de
// la refonte Santé nutritionnelle. No React, no Supabase, no UI tokens.
//
// Répond à : « Comment répartir intelligemment les calories entre
// protéines, lipides et glucides ? ». Produit une RECOMMANDATION
// déterministe et explicable — NE MODIFIE JAMAIS `nutrition_goals.proteins/
// carbs/fats` (ce sont des données distinctes, voir `compareMacros`).
//
// Travaille sur l'enveloppe calorique ACTIVE (`nutrition_goals.calories`),
// jamais sur une recommandation Cortex qui n'a pas encore été appliquée
// (voir lib/fitness/calorieStrategy.ts) — mais `computeMacroStrategy` est
// une fonction pure de `calories` : l'appeler avec une autre valeur que
// l'objectif actif EST la fonction de simulation demandée pour une future
// enveloppe (aucune fonction séparée nécessaire).
//
// Architecture manual/automatic (règle produit permanente, voir
// calorieStrategy.ts) : Phase 5A ne modifie AUCUNE macro, quel que soit
// `calorie_strategy_mode`. Le bouton "Appliquer" macros et l'écriture
// automatique (recalcul après un ajustement calorique automatique)
// viendront en Phase 5B — cette phase ne fait qu'observer/recommander.
//
// Préparation des futurs verrous (§21 du brief, PAS implémenté ici) : la
// priorité protéines → lipides → glucides ci-dessous est volontairement
// écrite comme un pipeline séquentiel (chaque étape consomme le budget
// restant de la précédente) précisément pour qu'un futur paramètre
// `locks` (ex. `{ proteinsG: 160 }`) puisse remplacer une étape calculée
// par une valeur imposée par l'utilisateur sans réécrire le pipeline.

import { calculateCaloriesFromMacros } from "@/lib/nutrition/macros";
import type { CalorieStrategyGoal } from "./calorieStrategy";

// ---------------------------------------------------------------------
// Constantes centralisées
// ---------------------------------------------------------------------

export const MACRO_STRATEGY_COEFFICIENTS = {
  /**
   * g de protéines / kg de poids corporel / jour, par objectif. Basé sur le
   * poids TOTAL, jamais un pourcentage des calories (voir §14 du brief : un
   * changement de calories seul ne doit pas faire varier les protéines).
   * `fat_loss` le plus élevé (protection de la masse maigre en déficit),
   * `muscle_gain` élevé mais pas supérieur (le surplus calorique soutient
   * déjà l'anabolisme), `maintenance` intermédiaire. Plages courantes de la
   * littérature sur la nutrition sportive — volontairement simples, pas une
   * fausse précision (2.2, pas "2.17").
   */
  PROTEIN_G_PER_KG: {
    fat_loss: 2.2,
    maintenance: 1.8,
    muscle_gain: 2.0,
  } satisfies Record<CalorieStrategyGoal, number>,
  /**
   * Plancher lipides — le plus élevé des deux calculs suivants est retenu
   * (protection à la fois en absolu et relativement à l'enveloppe
   * calorique) :
   *  - `FAT_G_PER_KG_MIN` × poids ;
   *  - `FAT_MIN_PERCENT_OF_CALORIES` × calories, converti en grammes.
   * Sert de CIBLE dans le pipeline (pas juste un plancher qu'on dépasserait
   * ensuite) — les glucides absorbent tout le reste, voir §7 du brief.
   */
  FAT_G_PER_KG_MIN: 0.8,
  FAT_MIN_PERCENT_OF_CALORIES: 0.2,
  /**
   * Garde-fou §5 du brief : la composition corporelle (`body_tracking.
   * body_fat`) est optionnelle, saisie manuellement, et non fiable pour
   * tous les utilisateurs — le moteur ne s'appuie JAMAIS dessus. À la
   * place, le poids utilisé pour les calculs g/kg (protéines ET lipides)
   * est plafonné : au-delà, un poids corporel très élevé ne fait plus
   * grimper la recommandation en grammes de façon non bornée.
   */
  BODYWEIGHT_CAP_KG: 120,
  /** Arrondi humain des macros affichées — évite "163.7 g". */
  ROUNDING_STEP_G: 5,
  /**
   * Tolérance énergétique entre `macroCalories` (P×4+C×4+L×9 après arrondi)
   * et l'objectif calorique — au-delà, un seul ajustement des glucides
   * (variable la plus flexible) rapproche le total, sans boucle.
   */
  CALORIE_TOLERANCE_KCAL: 50,
} as const;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface MacroStrategyInput {
  /** Enveloppe calorique à répartir — généralement `nutrition_goals.calories`, mais toute valeur permet de simuler une autre enveloppe. */
  calories: number | null;
  bodyWeightKg: number | null;
  goal: CalorieStrategyGoal;
}

export interface MacroStrategyResult {
  goal: CalorieStrategyGoal;
  calorieTarget: number | null;
  bodyWeightKg: number | null;
  /** `null` uniquement si non calculable — voir `limitReasons`. */
  proteinsG: number | null;
  fatsG: number | null;
  carbsG: number | null;
  /** Coefficient g/kg réellement utilisé (avant plafond de poids) — pour l'explicabilité. */
  proteinTargetGPerKg: number | null;
  fatTargetGPerKg: number | null;
  /** P×4 + C×4 + L×9 sur les valeurs ARRONDIES retournées. */
  macroCalories: number | null;
  /** `macroCalories - calorieTarget`. Jamais caché, même après le nudge de tolérance. */
  calorieDifference: number | null;
  /** `true` si l'enveloppe a contraint une ou plusieurs cibles, ou si la donnée est insuffisante. */
  limited: boolean;
  limitReasons: string[];
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

function isValidPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isKnownGoal(value: string): value is CalorieStrategyGoal {
  return value === "fat_loss" || value === "maintenance" || value === "muscle_gain";
}

function roundToStep(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step);
}

function unavailable(
  goal: CalorieStrategyGoal,
  calorieTarget: number | null,
  bodyWeightKg: number | null,
  reasons: string[],
): MacroStrategyResult {
  return {
    goal,
    calorieTarget,
    bodyWeightKg,
    proteinsG: null,
    fatsG: null,
    carbsG: null,
    proteinTargetGPerKg: null,
    fatTargetGPerKg: null,
    macroCalories: null,
    calorieDifference: null,
    limited: true,
    limitReasons: reasons,
  };
}

// ---------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------

/**
 * Répartition macros déterministe : (1) protéines depuis le poids corporel
 * et l'objectif, (2) lipides à leur cible/plancher, (3) glucides = calories
 * restantes. Ne fabrique jamais de valeur si `calories`/`bodyWeightKg` sont
 * indisponibles ou si `goal` est inconnu (`limited: true`, `proteinsG` etc.
 * restent `null`, jamais 0).
 */
export function computeMacroStrategy(input: MacroStrategyInput): MacroStrategyResult {
  const { ROUNDING_STEP_G, CALORIE_TOLERANCE_KCAL } = MACRO_STRATEGY_COEFFICIENTS;

  if (!isValidPositiveFinite(input.calories)) {
    return unavailable(input.goal, null, input.bodyWeightKg, [
      "Objectif calorique indisponible — recommandation impossible.",
    ]);
  }
  const calorieTarget = input.calories;

  if (!isValidPositiveFinite(input.bodyWeightKg)) {
    return unavailable(input.goal, calorieTarget, null, [
      "Poids corporel indisponible — nécessaire pour une recommandation de protéines fiable.",
    ]);
  }
  const bodyWeightKg = input.bodyWeightKg;

  if (!isKnownGoal(input.goal)) {
    return unavailable(input.goal, calorieTarget, bodyWeightKg, ["Objectif inconnu."]);
  }
  const goal = input.goal;

  const limitReasons: string[] = [];
  const weightForGPerKg = Math.min(bodyWeightKg, MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG);
  if (bodyWeightKg > MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG) {
    limitReasons.push(
      `Calcul des protéines/lipides basé sur un poids plafonné à ${MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG} kg pour rester raisonnable.`,
    );
  }

  const proteinTargetGPerKg = MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG[goal];
  const fatTargetGPerKg = MACRO_STRATEGY_COEFFICIENTS.FAT_G_PER_KG_MIN;

  const targetProteinG = weightForGPerKg * proteinTargetGPerKg;
  const fatFloorFromWeightG = weightForGPerKg * fatTargetGPerKg;
  const fatFloorFromCaloriesG =
    (calorieTarget * MACRO_STRATEGY_COEFFICIENTS.FAT_MIN_PERCENT_OF_CALORIES) / 9;
  const targetFatG = Math.max(fatFloorFromWeightG, fatFloorFromCaloriesG);

  const targetProteinCalories = targetProteinG * 4;
  const targetFatCalories = targetFatG * 9;

  let proteinG: number;
  let fatG: number;
  let carbsG: number;

  if (targetProteinCalories >= calorieTarget) {
    // Cas extrême (§9/§36) : même les protéines seules dépassent
    // l'enveloppe. Toute l'enveloppe part en protéines, rien d'autre.
    proteinG = calorieTarget / 4;
    fatG = 0;
    carbsG = 0;
    limitReasons.push(
      "Enveloppe calorique insuffisante même pour les protéines seules — cas extrême.",
    );
  } else if (targetProteinCalories + targetFatCalories > calorieTarget) {
    // Protéines honorées à leur cible ; lipides réduits au maximum
    // compatible avec ce qui reste ; rien pour les glucides.
    proteinG = targetProteinG;
    const remainingForFatCalories = Math.max(0, calorieTarget - targetProteinCalories);
    fatG = remainingForFatCalories / 9;
    carbsG = 0;
    limitReasons.push(
      "Lipides réduits sous leur cible pour respecter l'enveloppe calorique après les protéines.",
    );
  } else {
    proteinG = targetProteinG;
    fatG = targetFatG;
    const remainingCalories = calorieTarget - targetProteinCalories - targetFatCalories;
    carbsG = remainingCalories / 4;
  }

  proteinG = roundToStep(proteinG, ROUNDING_STEP_G);
  fatG = roundToStep(fatG, ROUNDING_STEP_G);
  carbsG = roundToStep(carbsG, ROUNDING_STEP_G);

  let macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
  let calorieDifference = macroCalories - calorieTarget;

  // Tolérance §17 : un seul nudge des glucides (variable la plus flexible),
  // jamais de boucle, jamais négatif.
  if (Math.abs(calorieDifference) > CALORIE_TOLERANCE_KCAL) {
    const stepsToRemove = Math.round(calorieDifference / 4 / ROUNDING_STEP_G);
    const nudgedCarbsG = Math.max(0, carbsG - stepsToRemove * ROUNDING_STEP_G);
    if (nudgedCarbsG !== carbsG) {
      carbsG = nudgedCarbsG;
      macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
      calorieDifference = macroCalories - calorieTarget;
      limitReasons.push("Glucides ajustés pour rapprocher l'apport total de l'objectif calorique.");
    }
  }

  return {
    goal,
    calorieTarget,
    bodyWeightKg,
    proteinsG: proteinG,
    fatsG: fatG,
    carbsG,
    proteinTargetGPerKg,
    fatTargetGPerKg,
    macroCalories,
    calorieDifference,
    limited: limitReasons.length > 0,
    limitReasons,
  };
}

// ---------------------------------------------------------------------
// Comparaison avec les macros actives — jamais utilisée pour écrire
// automatiquement `nutrition_goals.proteins/carbs/fats`.
// ---------------------------------------------------------------------

export interface MacroComparisonEntry {
  current: number | null;
  recommended: number | null;
  /** `recommended - current`, en grammes. `null` si l'un des deux manque. */
  differenceG: number | null;
}

export interface MacroComparison {
  proteins: MacroComparisonEntry;
  carbs: MacroComparisonEntry;
  fats: MacroComparisonEntry;
}

export interface CurrentMacros {
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

export function compareMacros(
  current: CurrentMacros,
  recommended: MacroStrategyResult,
): MacroComparison {
  const entry = (c: number | null, r: number | null): MacroComparisonEntry => ({
    current: c,
    recommended: r,
    differenceG: c != null && r != null ? Math.round((r - c) * 10) / 10 : null,
  });
  return {
    proteins: entry(current.proteins, recommended.proteinsG),
    carbs: entry(current.carbs, recommended.carbsG),
    fats: entry(current.fats, recommended.fatsG),
  };
}
