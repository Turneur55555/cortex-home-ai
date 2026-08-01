// Pure domain logic for la recommandation calorique — Phase 4A de la
// refonte Santé nutritionnelle. No React, no Supabase, no UI tokens.
//
// Répond à : « Combien cette personne devrait-elle manger selon son
// objectif ? ». Produit une RECOMMANDATION déterministe et explicable —
// NE MODIFIE JAMAIS `nutrition_goals.calories` (l'objectif actif de
// l'utilisateur reste une donnée distincte, voir `compareCalorieGoal`
// ci-dessous). Aucun recalcul automatique des macros dans cette phase.
//
// Architecture manual/automatic (règle produit permanente) :
//  - MANUEL (implémenté ici) : Cortex calcule une recommandation, l'affiche
//    à côté de l'objectif actif, et attend une validation explicite de
//    l'utilisateur avant toute écriture (le bouton "Appliquer" n'écrit PAS
//    encore en base en Phase 4A — voir `compareCalorieGoal`, qui prépare
//    seulement les données que ce bouton consommera).
//  - AUTOMATIQUE (Phase 4B+, PAS implémenté ici) : Cortex pourra appliquer
//    automatiquement une recommandation validée par des garde-fous
//    supplémentaires (TDEE suffisamment fiable, changement minimal
//    significatif, changement maximal par ajustement, délai minimal entre
//    deux ajustements, historique de la dernière modification, retour au
//    mode manuel à tout moment). Emplacement recommandé pour stocker cette
//    préférence : étendre `nutrition_goals` (table 1-ligne-par-utilisateur
//    déjà utilisée pour les objectifs actifs) avec des colonnes telles que
//    `goal` (fat_loss|maintenance|muscle_gain), `target_rate`
//    (slow|moderate|fast), `calorie_strategy_mode` (manual|automatic) et
//    `last_auto_adjustment_at` (timestamptz, pour le délai minimal entre
//    deux ajustements) — pas de nouvelle table nécessaire a priori. AUCUNE
//    migration n'est créée dans cette phase : le mode automatique n'étant
//    pas actif, cette préférence n'a rien à persister pour l'instant.

import { KCAL_PER_KG_BODY_MASS } from "./energyConstants";
import type { AdaptiveTdeeCalibrationResult } from "./adaptiveTdeeCalibration";

// ---------------------------------------------------------------------
// Constantes centralisées
// ---------------------------------------------------------------------

export type CalorieStrategyGoal = "fat_loss" | "maintenance" | "muscle_gain";
export type FatLossRate = "slow" | "moderate" | "fast";
export type MuscleGainRate = "slow" | "moderate";

/** Mode futur (Phase 4B) — voir en-tête de fichier. Non consommé en Phase 4A. */
export type CalorieStrategyMode = "manual" | "automatic";

interface RateDefinition {
  label: string;
  /** % du poids corporel visé par SEMAINE — converti en déficit/surplus quotidien via `KCAL_PER_KG_BODY_MASS`. */
  weeklyBodyWeightPercent: number;
}

/**
 * Rythmes centralisés, exprimés en % du poids corporel par semaine plutôt
 * qu'en kcal fixes — une même valeur absolue (ex. -500 kcal/j) n'a pas le
 * même sens pour 55 kg que pour 110 kg. Plages conservatrices, cohérentes
 * avec la littérature courante sur la perte/prise de poids progressive.
 * Le rythme "fast" reste volontairement borné par les garde-fous
 * `CALORIE_STRATEGY_GUARDRAILS` ci-dessous — jamais un rythme agressif par
 * défaut.
 */
export const CALORIE_STRATEGY_RATES: {
  fat_loss: Record<FatLossRate, RateDefinition>;
  muscle_gain: Record<MuscleGainRate, RateDefinition>;
} = {
  fat_loss: {
    slow: { label: "Progressif", weeklyBodyWeightPercent: 0.25 },
    moderate: { label: "Modéré", weeklyBodyWeightPercent: 0.5 },
    fast: { label: "Rapide", weeklyBodyWeightPercent: 0.75 },
  },
  muscle_gain: {
    // Rythmes volontairement environ moitié moindres que la perte : un
    // surplus trop rapide maximise la prise de masse grasse, pas seulement
    // musculaire — cohérent avec l'approche "progressive, pas un bulk
    // agressif par défaut" demandée.
    slow: { label: "Progressif", weeklyBodyWeightPercent: 0.125 },
    moderate: { label: "Modéré", weeklyBodyWeightPercent: 0.25 },
  },
};

export const CALORIE_STRATEGY_GUARDRAILS = {
  /** Déficit quotidien maximal autorisé, kcal — même si poids×rythme impliquerait davantage. */
  MAX_DEFICIT_KCAL: 1000,
  /** Surplus quotidien maximal autorisé, kcal. */
  MAX_SURPLUS_KCAL: 500,
  /**
   * Plancher de sécurité de dernier recours. Historiquement codé en dur
   * (`Math.max(1200, ...)`) dans `lib/fitness/metabolism.ts#computeCalorieTarget`
   * sans justification ni contexte individuel (sexe/taille/état de santé) —
   * PAS conservé aveuglément ici. Conservé uniquement comme garde-fou
   * contre une valeur absurde (ex. TDEE très bas + rythme "fast"), TOUJOURS
   * accompagné de `limited: true` dans le résultat plutôt que présenté
   * comme une recommandation médicale personnalisée valable pour tout le
   * monde (voir §8 du brief Phase 4A).
   */
  ABSOLUTE_MIN_FLOOR_KCAL: 1200,
} as const;

/**
 * Pas d'arrondi appliqué à la recommandation finale (perte/prise de masse
 * uniquement — le maintien n'en a pas besoin, voir plus bas) pour éviter
 * une précision illusoire (ex. "2 137 kcal") issue de la combinaison
 * poids × % × constante énergétique.
 */
export const CALORIE_STRATEGY_ROUNDING_STEP_KCAL = 25;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type CalorieReferenceSource = "adaptive" | "modeled";

export interface CalorieStrategyTargetRate {
  key: FatLossRate | MuscleGainRate;
  label: string;
  weeklyBodyWeightPercent: number;
}

export interface CalorieStrategyResult {
  goal: CalorieStrategyGoal;
  /** `null` si aucun TDEE exploitable — voir `limitReasons`. */
  referenceTdeeKcal: number | null;
  referenceSource: CalorieReferenceSource;
  /** `null` si non calculable (TDEE/poids/rythme manquant ou invalide) — jamais une valeur fabriquée. */
  recommendedCalories: number | null;
  /** `recommendedCalories - referenceTdeeKcal` — convention unique du moteur. `null` si non calculable. */
  dailyDeltaKcal: number | null;
  /** `null` pour `maintenance` (aucun rythme appliqué). */
  targetRate: CalorieStrategyTargetRate | null;
  estimatedWeeklyWeightChangeKg: number | null;
  estimatedWeeklyWeightChangePercent: number | null;
  /** `true` si un garde-fou a modifié/empêché la recommandation — voir `limitReasons`. */
  limited: boolean;
  limitReasons: string[];
}

export interface CalorieStrategyInput {
  goal: CalorieStrategyGoal;
  /** Requis pour `fat_loss`/`muscle_gain`, ignoré pour `maintenance`. */
  rate?: FatLossRate | MuscleGainRate;
  /** kg — requis pour `fat_loss`/`muscle_gain`, ignoré pour `maintenance`. */
  weightKg: number | null;
  /** Résultat Phase 3B (`computeAdaptiveTdeeCalibration`) — fournit modélisé + adaptatif + état. */
  calibration: AdaptiveTdeeCalibrationResult;
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

function isValidPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Source de dépense de référence — priorité au TDEE ADAPTATIF (Phase 3B)
 * s'il reflète une vraie calibration (`state !== "model_only"`), sinon
 * repli sur le TDEE MODÉLISÉ. Un nouvel utilisateur (aucune donnée
 * observée, `state === "model_only"`) reçoit donc une recommandation basée
 * sur `modeled` dès que son profil métabolique est complet — jamais
 * bloqué en attendant un TDEE observé.
 */
function pickReferenceTdee(calibration: AdaptiveTdeeCalibrationResult): {
  kcal: number | null;
  source: CalorieReferenceSource;
} {
  if (calibration.state !== "model_only" && isValidPositiveFinite(calibration.adaptiveTdeeKcal)) {
    return { kcal: calibration.adaptiveTdeeKcal, source: "adaptive" };
  }
  if (isValidPositiveFinite(calibration.modeledTdeeKcal)) {
    return { kcal: calibration.modeledTdeeKcal, source: "modeled" };
  }
  return { kcal: null, source: "modeled" };
}

function emptyResult(
  goal: CalorieStrategyGoal,
  referenceTdeeKcal: number | null,
  referenceSource: CalorieReferenceSource,
  limitReasons: string[],
): CalorieStrategyResult {
  return {
    goal,
    referenceTdeeKcal,
    referenceSource,
    recommendedCalories: null,
    dailyDeltaKcal: null,
    targetRate: null,
    estimatedWeeklyWeightChangeKg: null,
    estimatedWeeklyWeightChangePercent: null,
    limited: true,
    limitReasons,
  };
}

// ---------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------

/**
 * Recommandation calorique déterministe selon l'objectif. Ne modifie
 * jamais `nutrition_goals.calories` — voir `compareCalorieGoal` pour la
 * comparaison informative avec l'objectif actif.
 */
export function computeCalorieStrategy(input: CalorieStrategyInput): CalorieStrategyResult {
  const { kcal: referenceTdeeKcal, source: referenceSource } = pickReferenceTdee(input.calibration);

  if (referenceTdeeKcal == null) {
    return emptyResult(input.goal, null, referenceSource, [
      "Aucun TDEE exploitable — recommandation indisponible.",
    ]);
  }

  if (input.goal === "maintenance") {
    // Pas d'arrondi ici : referenceTdeeKcal est déjà un entier produit par
    // tdee.ts/adaptiveTdeeCalibration.ts (Math.round en amont) — le
    // maintien EST le TDEE de référence, pas une valeur combinant plusieurs
    // approximations (voir CALORIE_STRATEGY_ROUNDING_STEP_KCAL plus haut).
    return {
      goal: "maintenance",
      referenceTdeeKcal,
      referenceSource,
      recommendedCalories: referenceTdeeKcal,
      dailyDeltaKcal: 0,
      targetRate: null,
      estimatedWeeklyWeightChangeKg: 0,
      estimatedWeeklyWeightChangePercent: 0,
      limited: false,
      limitReasons: [],
    };
  }

  if (input.goal !== "fat_loss" && input.goal !== "muscle_gain") {
    return emptyResult(input.goal, referenceTdeeKcal, referenceSource, ["Objectif inconnu."]);
  }

  if (!isValidPositiveFinite(input.weightKg)) {
    return emptyResult(input.goal, referenceTdeeKcal, referenceSource, [
      "Poids nécessaire pour cette stratégie non disponible.",
    ]);
  }
  const weightKg = input.weightKg;

  const rateTable = CALORIE_STRATEGY_RATES[input.goal];
  const rateKey = input.rate;
  if (rateKey == null || !(rateKey in rateTable)) {
    return emptyResult(input.goal, referenceTdeeKcal, referenceSource, [
      "Rythme cible manquant ou non reconnu pour cet objectif.",
    ]);
  }
  const rate = rateTable[rateKey as keyof typeof rateTable];

  const limitReasons: string[] = [];
  const magnitudeKcalPerDay =
    (weightKg * (rate.weeklyBodyWeightPercent / 100) * KCAL_PER_KG_BODY_MASS) / 7;
  let clampedDelta = input.goal === "fat_loss" ? -magnitudeKcalPerDay : magnitudeKcalPerDay;

  if (input.goal === "fat_loss" && clampedDelta < -CALORIE_STRATEGY_GUARDRAILS.MAX_DEFICIT_KCAL) {
    clampedDelta = -CALORIE_STRATEGY_GUARDRAILS.MAX_DEFICIT_KCAL;
    limitReasons.push(
      `Déficit plafonné à ${CALORIE_STRATEGY_GUARDRAILS.MAX_DEFICIT_KCAL} kcal/j (rythme demandé trop agressif pour ce poids).`,
    );
  }
  if (input.goal === "muscle_gain" && clampedDelta > CALORIE_STRATEGY_GUARDRAILS.MAX_SURPLUS_KCAL) {
    clampedDelta = CALORIE_STRATEGY_GUARDRAILS.MAX_SURPLUS_KCAL;
    limitReasons.push(
      `Surplus plafonné à ${CALORIE_STRATEGY_GUARDRAILS.MAX_SURPLUS_KCAL} kcal/j (rythme demandé trop agressif pour ce poids).`,
    );
  }

  let recommendedCalories = roundToStep(
    referenceTdeeKcal + clampedDelta,
    CALORIE_STRATEGY_ROUNDING_STEP_KCAL,
  );
  if (recommendedCalories < CALORIE_STRATEGY_GUARDRAILS.ABSOLUTE_MIN_FLOOR_KCAL) {
    recommendedCalories = CALORIE_STRATEGY_GUARDRAILS.ABSOLUTE_MIN_FLOOR_KCAL;
    limitReasons.push(
      `Apport plafonné à un minimum de sécurité générique (${CALORIE_STRATEGY_GUARDRAILS.ABSOLUTE_MIN_FLOOR_KCAL} kcal/j) — pas une recommandation médicale personnalisée.`,
    );
  }
  // Filet de sécurité ultime — la cible ne doit jamais être négative même
  // si les constantes ci-dessus étaient un jour mal configurées.
  recommendedCalories = Math.max(0, recommendedCalories);

  const dailyDeltaKcal = recommendedCalories - referenceTdeeKcal;
  const estimatedWeeklyWeightChangeKg =
    Math.round(((dailyDeltaKcal * 7) / KCAL_PER_KG_BODY_MASS) * 100) / 100;
  const estimatedWeeklyWeightChangePercent =
    Math.round((estimatedWeeklyWeightChangeKg / weightKg) * 1000) / 10;

  return {
    goal: input.goal,
    referenceTdeeKcal,
    referenceSource,
    recommendedCalories,
    dailyDeltaKcal,
    targetRate: {
      key: rateKey,
      label: rate.label,
      weeklyBodyWeightPercent: rate.weeklyBodyWeightPercent,
    },
    estimatedWeeklyWeightChangeKg,
    estimatedWeeklyWeightChangePercent,
    limited: limitReasons.length > 0,
    limitReasons,
  };
}

// ---------------------------------------------------------------------
// Comparaison avec l'objectif actif — jamais utilisée pour écrire
// automatiquement `nutrition_goals.calories` en Phase 4A. Consommée par le
// futur bouton "Appliquer" (manuel, Phase 4A UI) et par le futur mode
// automatique (Phase 4B).
// ---------------------------------------------------------------------

export interface CalorieGoalComparison {
  currentCalories: number | null;
  recommendedCalories: number | null;
  /** `recommended - current`. `null` si l'un des deux manque. */
  differenceKcal: number | null;
}

export function compareCalorieGoal(
  currentCalories: number | null,
  recommendedCalories: number | null,
): CalorieGoalComparison {
  return {
    currentCalories,
    recommendedCalories,
    differenceKcal:
      currentCalories != null && recommendedCalories != null
        ? recommendedCalories - currentCalories
        : null,
  };
}
