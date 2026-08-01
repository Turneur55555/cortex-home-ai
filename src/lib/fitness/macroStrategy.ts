// Pure domain logic for la recommandation de MACRONUTRIMENTS — Phase 5A
// (recommandation) + Phase 5B (verrous individuels) de la refonte Santé
// nutritionnelle. No React, no Supabase, no UI tokens.
//
// Répond à : « Comment répartir intelligemment les calories entre
// protéines, lipides et glucides ? ». Produit une RECOMMANDATION
// déterministe et explicable — cette fonction ne MODIFIE JAMAIS elle-même
// `nutrition_goals.proteins/carbs/fats` (l'écriture réelle passe par
// `useApplyMacroGoal`/la RPC `apply_macro_goal_adjustment`, voir
// `useNutritionGoals.ts`).
//
// Travaille sur l'enveloppe calorique ACTIVE (`nutrition_goals.calories`),
// jamais sur une recommandation Cortex qui n'a pas encore été appliquée
// (voir lib/fitness/calorieStrategy.ts) — mais `computeMacroStrategy` est
// une fonction pure de `calories` : l'appeler avec une autre valeur que
// l'objectif actif EST la fonction de simulation demandée pour une future
// enveloppe (aucune fonction séparée nécessaire).
//
// Verrous (Phase 5B) : un verrou ne stocke PAS de valeur dédiée — la valeur
// verrouillée EST la valeur active correspondante dans `nutrition_goals`
// (voir migration 20260808090000). Le pipeline ci-dessous a été écrit dès
// la Phase 5A comme une séquence protéines → lipides → glucides
// précisément pour que chaque étape verrouillée puisse être remplacée par
// une valeur imposée sans réécrire le pipeline — voir
// `computeMacroStrategyLocked` plus bas, appelée dès qu'au moins un verrou
// est actif (le chemin SANS verrou reste le code Phase 5A original,
// inchangé, pour garantir zéro régression).

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
   * Garde-fou §5 du brief Phase 5 : la composition corporelle (`body_
   * tracking.body_fat`) reste optionnelle, et le moteur retombe TOUJOURS
   * sur le poids corporel total par défaut — jamais de blocage/formulaire
   * obligatoire. À la place, le poids utilisé pour les calculs g/kg
   * (protéines ET lipides) est plafonné : au-delà, un poids corporel très
   * élevé ne fait plus grimper la recommandation en grammes de façon non
   * bornée. Depuis la Phase 7, un appelant qui dispose d'une composition
   * corporelle suffisamment récente et fiable peut fournir
   * `MacroStrategyInput.proteinTargetOverrideG` (calculé depuis la masse
   * maigre, voir `bodyCompositionForNutrition.ts`) pour remplacer
   * uniquement l'étape protéines de ce pipeline — le plafond ci-dessous
   * continue de s'appliquer à la masse maigre dans ce cas (voir
   * `computeLeanMassProteinTargetG`), jamais retiré.
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
  /**
   * Garde-fou Phase 7 (§24/§41 du brief) : même quand une nouvelle
   * composition corporelle rend un réalignement AUTOMATIQUE des protéines
   * éligible, un seul ajustement automatique ne peut jamais s'écarter de
   * plus de cette valeur (en grammes) par rapport à la valeur ACTIVE —
   * règle produit conservatrice et volontairement ronde, pas une
   * certitude physiologique. Voir `clampAutomaticProteinTarget`. Ne
   * s'applique jamais à une application MANUELLE (clic explicite de
   * l'utilisateur = pas de saut « caché »).
   */
  MAX_AUTO_PROTEIN_ADJUSTMENT_STEP_G: 30,
} as const;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/** D'où vient la cible protéique retenue par `computeMacroStrategy` — exposé pour l'UI (§14/§27 du brief Phase 7), jamais utilisé pour changer le comportement du pipeline lui-même. */
export type ProteinBasis = "body_weight" | "lean_mass";

export interface MacroStrategyInput {
  /** Enveloppe calorique à répartir — généralement `nutrition_goals.calories`, mais toute valeur permet de simuler une autre enveloppe. */
  calories: number | null;
  bodyWeightKg: number | null;
  goal: CalorieStrategyGoal;
  /**
   * Verrous Phase 5B — `undefined`/`null` = macro non verrouillée. Une
   * valeur (y compris `0`) fige la macro correspondante à ce nombre de
   * grammes exact, quel que soit le reste du calcul (§10 du brief Phase
   * 5B : « Un verrou utilisateur est prioritaire sur Cortex »). Le
   * transmetteur (hook/UI) doit y passer la valeur ACTIVE de
   * `nutrition_goals` au moment où le verrou est activé — cette fonction
   * ne connaît que la valeur reçue, jamais une origine.
   */
  lockedProteinsG?: number | null;
  lockedCarbsG?: number | null;
  lockedFatsG?: number | null;
  /**
   * Phase 7 (§7/§11 du brief) : cible protéique déjà calculée depuis la
   * masse maigre (voir `computeLeanMassProteinTargetG` dans
   * `bodyCompositionForNutrition.ts`), en grammes, à utiliser À LA PLACE
   * de `poids × PROTEIN_G_PER_KG[goal]` pour cette seule étape du
   * pipeline — tout le reste (lipides, glucides, arrondi, enveloppe,
   * verrous) reste strictement identique. `undefined`/`null`/négatif/non
   * fini = ignoré, comportement Phase 5 inchangé (repli poids corporel).
   * Un verrou protéines actif reste TOUJOURS prioritaire sur cette valeur
   * (le verrou n'appelle même pas ce chemin, voir `computeMacroStrategyLocked`).
   */
  proteinTargetOverrideG?: number | null;
}

export interface MacroStrategyResult {
  goal: CalorieStrategyGoal;
  calorieTarget: number | null;
  bodyWeightKg: number | null;
  /** `null` uniquement si non calculable — voir `limitReasons`. */
  proteinsG: number | null;
  fatsG: number | null;
  carbsG: number | null;
  /** Coefficient g/kg réellement utilisé (avant plafond de poids) — `null` si la macro est verrouillée, si un `proteinTargetOverrideG` a été utilisé (voir `proteinBasis`), ou non calculable. */
  proteinTargetGPerKg: number | null;
  fatTargetGPerKg: number | null;
  /** `"lean_mass"` uniquement si `proteinTargetOverrideG` a été fourni ET utilisé (protéines non verrouillées) — `"body_weight"` sinon, y compris quand les protéines sont verrouillées. */
  proteinBasis: ProteinBasis;
  /** P×4 + C×4 + L×9 sur les valeurs ARRONDIES retournées. */
  macroCalories: number | null;
  /** `macroCalories - calorieTarget`. Jamais caché, même après le nudge de tolérance. */
  calorieDifference: number | null;
  /** `true` si l'enveloppe a contraint une ou plusieurs cibles, ou si la donnée est insuffisante. */
  limited: boolean;
  limitReasons: string[];
  /** `true` si les TROIS macros sont verrouillées — Cortex ne peut plus rien calculer, voir §13 du brief Phase 5B. */
  allMacrosLocked: boolean;
  /** `true` si la somme des macros verrouillées dépasse déjà `calorieTarget` — application automatique bloquée, jamais de réduction silencieuse d'un verrou (§15 du brief Phase 5B). */
  locksIncompatible: boolean;
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

function isValidPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Comme `isValidPositiveFinite`, mais `0` est accepté (une cible protéique dérivée d'une masse maigre nulle n'a pas de sens en pratique, mais ce n'est pas cette fonction qui doit le décider — elle ne fait que valider la forme). */
function isValidNonNegativeFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
    proteinBasis: "body_weight",
    macroCalories: null,
    calorieDifference: null,
    limited: true,
    limitReasons: reasons,
    allMacrosLocked: false,
    locksIncompatible: false,
  };
}

/** `undefined`/`null`/négatif/non-fini → pas de verrou. `0` est une valeur de verrou valide. */
function normalizeLock(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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

  const overrideProteinG = isValidNonNegativeFinite(input.proteinTargetOverrideG)
    ? input.proteinTargetOverrideG
    : null;

  const lockedProteinG = normalizeLock(input.lockedProteinsG);
  const lockedCarbsG = normalizeLock(input.lockedCarbsG);
  const lockedFatG = normalizeLock(input.lockedFatsG);
  if (lockedProteinG != null || lockedCarbsG != null || lockedFatG != null) {
    return computeMacroStrategyLocked(
      goal,
      calorieTarget,
      bodyWeightKg,
      lockedProteinG,
      lockedCarbsG,
      lockedFatG,
      overrideProteinG,
    );
  }

  const limitReasons: string[] = [];
  const weightForGPerKg = Math.min(bodyWeightKg, MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG);
  if (bodyWeightKg > MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG) {
    limitReasons.push(
      `Calcul des protéines/lipides basé sur un poids plafonné à ${MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG} kg pour rester raisonnable.`,
    );
  }

  const proteinBasis: ProteinBasis = overrideProteinG != null ? "lean_mass" : "body_weight";
  const proteinTargetGPerKg =
    overrideProteinG != null ? null : MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG[goal];
  const fatTargetGPerKg = MACRO_STRATEGY_COEFFICIENTS.FAT_G_PER_KG_MIN;

  const targetProteinG =
    overrideProteinG != null ? overrideProteinG : weightForGPerKg * (proteinTargetGPerKg as number);
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
    proteinBasis,
    macroCalories,
    calorieDifference,
    limited: limitReasons.length > 0,
    limitReasons,
    allMacrosLocked: false,
    locksIncompatible: false,
  };
}

// ---------------------------------------------------------------------
// Pipeline avec verrous (Phase 5B) — appelé uniquement si au moins un
// verrou est actif (voir branche ci-dessus). Généralise le pipeline
// protéines → lipides → glucides ci-dessus : une macro verrouillée est
// retirée du calcul (sa valeur est fixe, ses calories sont réservées à
// l'avance) ; les macros non verrouillées se répartissent ce qui reste,
// dans le même ordre de priorité que la Phase 5A.
// ---------------------------------------------------------------------

function computeMacroStrategyLocked(
  goal: CalorieStrategyGoal,
  calorieTarget: number,
  bodyWeightKg: number,
  lockedProteinG: number | null,
  lockedCarbsG: number | null,
  lockedFatG: number | null,
  overrideProteinG: number | null,
): MacroStrategyResult {
  const { ROUNDING_STEP_G, CALORIE_TOLERANCE_KCAL } = MACRO_STRATEGY_COEFFICIENTS;
  const limitReasons: string[] = [];

  const lockedCalories =
    (lockedProteinG != null ? lockedProteinG * 4 : 0) +
    (lockedCarbsG != null ? lockedCarbsG * 4 : 0) +
    (lockedFatG != null ? lockedFatG * 9 : 0);

  const allMacrosLocked = lockedProteinG != null && lockedCarbsG != null && lockedFatG != null;

  // §13 : les trois macros sont verrouillées — Cortex ne calcule plus rien,
  // il ne fait que constater. Les valeurs verrouillées sont retournées
  // telles quelles, jamais modifiées.
  if (allMacrosLocked) {
    const proteinG = lockedProteinG as number;
    const carbsG = lockedCarbsG as number;
    const fatG = lockedFatG as number;
    const macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
    const calorieDifference = macroCalories - calorieTarget;
    if (Math.abs(calorieDifference) > CALORIE_TOLERANCE_KCAL) {
      limitReasons.push(
        "Toutes les macros sont verrouillées : impossible de les ajuster pour respecter l'objectif calorique sans casser un verrou.",
      );
    }
    return {
      goal,
      calorieTarget,
      bodyWeightKg,
      proteinsG: proteinG,
      carbsG,
      fatsG: fatG,
      proteinTargetGPerKg: null,
      fatTargetGPerKg: null,
      proteinBasis: "body_weight",
      macroCalories,
      calorieDifference,
      limited: limitReasons.length > 0,
      limitReasons,
      allMacrosLocked: true,
      locksIncompatible: false,
    };
  }

  // §15 : les verrous, à eux seuls, dépassent déjà l'enveloppe calorique.
  // Cortex ne réduit jamais un verrou — bloque l'application automatique et
  // le signale explicitement plutôt que de fabriquer une répartition.
  if (lockedCalories > calorieTarget) {
    const proteinG = lockedProteinG ?? 0;
    const carbsG = lockedCarbsG ?? 0;
    const fatG = lockedFatG ?? 0;
    const macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
    return {
      goal,
      calorieTarget,
      bodyWeightKg,
      proteinsG: proteinG,
      carbsG,
      fatsG: fatG,
      proteinTargetGPerKg: null,
      fatTargetGPerKg: null,
      proteinBasis: "body_weight",
      macroCalories,
      calorieDifference: macroCalories - calorieTarget,
      limited: true,
      limitReasons: [
        "Les valeurs verrouillées dépassent déjà l'objectif calorique actif — application automatique bloquée.",
      ],
      allMacrosLocked: false,
      locksIncompatible: true,
    };
  }

  const budget = calorieTarget - lockedCalories;
  const weightForGPerKg = Math.min(bodyWeightKg, MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG);
  if (bodyWeightKg > MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG) {
    limitReasons.push(
      `Calcul des protéines/lipides basé sur un poids plafonné à ${MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG} kg pour rester raisonnable.`,
    );
  }

  const proteinTargetGPerKg = MACRO_STRATEGY_COEFFICIENTS.PROTEIN_G_PER_KG[goal];
  const fatTargetGPerKgConst = MACRO_STRATEGY_COEFFICIENTS.FAT_G_PER_KG_MIN;

  let remaining = budget;
  let budgetExhausted = false;

  // Étape protéines — un override masse maigre (Phase 7) remplace le
  // calcul poids×coefficient UNIQUEMENT si les protéines ne sont pas
  // verrouillées (le verrou reste prioritaire, §18/§19 du brief Phase 7).
  const proteinBasis: ProteinBasis =
    lockedProteinG == null && overrideProteinG != null ? "lean_mass" : "body_weight";
  let proteinG: number;
  if (lockedProteinG != null) {
    proteinG = lockedProteinG;
  } else {
    const targetProteinG =
      overrideProteinG != null ? overrideProteinG : weightForGPerKg * proteinTargetGPerKg;
    const targetProteinCal = targetProteinG * 4;
    if (targetProteinCal >= remaining) {
      proteinG = remaining / 4;
      remaining = 0;
      budgetExhausted = true;
      limitReasons.push(
        "Enveloppe calorique restante insuffisante même pour les protéines seules — cas extrême.",
      );
    } else {
      proteinG = targetProteinG;
      remaining -= targetProteinCal;
    }
  }

  // Étape lipides — plancher basé sur l'objectif calorique TOTAL (pas
  // uniquement le budget restant), comme en Phase 5A.
  let fatG: number;
  if (lockedFatG != null) {
    fatG = lockedFatG;
  } else {
    const fatFloorFromWeightG = weightForGPerKg * fatTargetGPerKgConst;
    const fatFloorFromCaloriesG =
      (calorieTarget * MACRO_STRATEGY_COEFFICIENTS.FAT_MIN_PERCENT_OF_CALORIES) / 9;
    const targetFatG = Math.max(fatFloorFromWeightG, fatFloorFromCaloriesG);
    const targetFatCal = targetFatG * 9;
    if (targetFatCal > remaining) {
      fatG = remaining / 9;
      remaining = 0;
      if (!budgetExhausted) {
        limitReasons.push(
          "Lipides réduits sous leur cible pour respecter l'enveloppe calorique après les protéines.",
        );
      }
      budgetExhausted = true;
    } else {
      fatG = targetFatG;
      remaining -= targetFatCal;
    }
  }

  // Étape glucides — variable d'ajustement la plus flexible, jamais négative.
  let carbsG: number;
  if (lockedCarbsG != null) {
    carbsG = lockedCarbsG;
  } else {
    carbsG = remaining / 4;
  }

  proteinG = roundToStep(proteinG, ROUNDING_STEP_G);
  fatG = roundToStep(fatG, ROUNDING_STEP_G);
  carbsG = roundToStep(carbsG, ROUNDING_STEP_G);

  let macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
  let calorieDifference = macroCalories - calorieTarget;

  // Tolérance : nudge glucides uniquement s'ils sont réellement ajustables
  // (non verrouillés) — casser un verrou pour rentrer dans la tolérance est
  // interdit (§19 du brief Phase 5B).
  if (Math.abs(calorieDifference) > CALORIE_TOLERANCE_KCAL) {
    if (lockedCarbsG == null) {
      const stepsToRemove = Math.round(calorieDifference / 4 / ROUNDING_STEP_G);
      const nudgedCarbsG = Math.max(0, carbsG - stepsToRemove * ROUNDING_STEP_G);
      if (nudgedCarbsG !== carbsG) {
        carbsG = nudgedCarbsG;
        macroCalories = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
        calorieDifference = macroCalories - calorieTarget;
        limitReasons.push(
          "Glucides ajustés pour rapprocher l'apport total de l'objectif calorique.",
        );
      }
    } else {
      limitReasons.push(
        "Les glucides sont verrouillés : l'apport total ne peut pas être rapproché davantage de l'objectif calorique sans casser un verrou.",
      );
    }
  }

  return {
    goal,
    calorieTarget,
    bodyWeightKg,
    proteinsG: proteinG,
    fatsG: fatG,
    carbsG,
    proteinTargetGPerKg:
      lockedProteinG != null || overrideProteinG != null ? null : proteinTargetGPerKg,
    fatTargetGPerKg: lockedFatG != null ? null : fatTargetGPerKgConst,
    proteinBasis,
    macroCalories,
    calorieDifference,
    limited: limitReasons.length > 0,
    limitReasons,
    allMacrosLocked: false,
    locksIncompatible: false,
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

// ---------------------------------------------------------------------
// Mode AUTOMATIQUE macros (Phase 5B) — éligibilité d'un réalignement,
// jamais l'application elle-même (voir `useApplyMacroGoal`). `macro_
// strategy_mode` est une préférence INDÉPENDANTE de `calorie_strategy_
// mode` (voir migration 20260808090000) : ce mode peut être automatique
// même si les calories restent manuelles, et inversement.
//
// PAS de cooldown ici, volontairement (§26 du brief) : le cooldown
// calorique (7 jours, `AUTO_CALORIE_ADJUSTMENT_CONFIG`) protège une
// DÉCISION (combien manger). Les macros ne sont qu'une CONSÉQUENCE de
// cette décision déjà prise — si les calories changent aujourd'hui, les
// macros doivent pouvoir se réaligner aujourd'hui, pas dans une semaine.
// L'idempotence vient plutôt de la comparaison "déjà aligné" ci-dessous
// (§27 : aucune écriture pour un écart nul) + de la protection `useRef`
// côté appelant (même pattern que Phase 4B).
// ---------------------------------------------------------------------

/**
 * Garde-fou Phase 7 (§24/§41) : plafonne l'écart, en grammes, entre une
 * cible protéique brute (issue de la masse maigre) et la valeur de
 * protéines ACTIVE, pour un réalignement AUTOMATIQUE uniquement. À
 * appeler par le composant qui construit `proteinTargetOverrideG` avant
 * de le transmettre à `computeMacroStrategy`, uniquement quand le mode
 * est automatique — jamais pour une application manuelle (l'utilisateur
 * voit et choisit d'appliquer la pleine recommandation).
 */
export function clampAutomaticProteinTarget(
  rawTargetProteinG: number,
  currentProteinsG: number | null,
): number {
  if (currentProteinsG == null || !Number.isFinite(currentProteinsG)) {
    return rawTargetProteinG;
  }
  const { MAX_AUTO_PROTEIN_ADJUSTMENT_STEP_G } = MACRO_STRATEGY_COEFFICIENTS;
  const upperBound = currentProteinsG + MAX_AUTO_PROTEIN_ADJUSTMENT_STEP_G;
  const lowerBound = Math.max(0, currentProteinsG - MAX_AUTO_PROTEIN_ADJUSTMENT_STEP_G);
  return Math.min(upperBound, Math.max(lowerBound, rawTargetProteinG));
}

export type AutoMacroAdjustmentReason =
  | "manual_mode"
  | "recommendation_unavailable"
  | "all_macros_locked"
  | "locks_incompatible"
  | "already_aligned"
  | "eligible";

export interface AutoMacroAdjustmentResult {
  eligible: boolean;
  reasons: AutoMacroAdjustmentReason[];
  /** Valeurs à appliquer si `eligible` (locked ou non — la RPC réécrit les trois pour rester atomique), sinon `null`. */
  proposedProteinsG: number | null;
  proposedCarbsG: number | null;
  proposedFatsG: number | null;
}

export interface AutoMacroAdjustmentInput {
  /** `nutrition_goals.macro_strategy_mode`. */
  mode: "manual" | "automatic";
  /** Résultat de `computeMacroStrategy` — DOIT déjà recevoir les verrous actifs (§10 : un verrou est prioritaire sur Cortex, y compris en automatique). */
  recommended: MacroStrategyResult;
  currentProteinsG: number | null;
  currentCarbsG: number | null;
  currentFatsG: number | null;
}

function autoMacroResult(
  eligible: boolean,
  reasons: AutoMacroAdjustmentReason[],
  proposed: MacroStrategyResult | null = null,
): AutoMacroAdjustmentResult {
  return {
    eligible,
    reasons,
    proposedProteinsG: proposed?.proteinsG ?? null,
    proposedCarbsG: proposed?.carbsG ?? null,
    proposedFatsG: proposed?.fatsG ?? null,
  };
}

/**
 * Détermine si un réalignement AUTOMATIQUE de `nutrition_goals.proteins/
 * carbs/fats` est autorisé maintenant. Ne modifie rien — purement
 * décisionnel (voir `useApplyMacroGoal` pour l'écriture réelle).
 */
export function evaluateAutoMacroAdjustment(
  input: AutoMacroAdjustmentInput,
): AutoMacroAdjustmentResult {
  if (input.mode !== "automatic") {
    return autoMacroResult(false, ["manual_mode"]);
  }
  if (input.recommended.proteinsG == null) {
    return autoMacroResult(false, ["recommendation_unavailable"]);
  }
  if (input.recommended.allMacrosLocked) {
    // §13 : rien à faire, Cortex ne peut modifier aucune macro.
    return autoMacroResult(false, ["all_macros_locked"]);
  }
  if (input.recommended.locksIncompatible) {
    // §15 : les verrous dépassent déjà l'enveloppe — jamais d'application automatique.
    return autoMacroResult(false, ["locks_incompatible"]);
  }

  // §27 : comparaison arrondie au gramme le plus proche pour ignorer le
  // bruit sous-grammique d'une saisie manuelle (ex. 160.0 vs 160), sans
  // masquer un écart réellement visible pour l'utilisateur.
  const aligned =
    Math.round(input.currentProteinsG ?? NaN) === input.recommended.proteinsG &&
    Math.round(input.currentCarbsG ?? NaN) === input.recommended.carbsG &&
    Math.round(input.currentFatsG ?? NaN) === input.recommended.fatsG;

  if (aligned) {
    return autoMacroResult(false, ["already_aligned"]);
  }

  return autoMacroResult(true, ["eligible"], input.recommended);
}
