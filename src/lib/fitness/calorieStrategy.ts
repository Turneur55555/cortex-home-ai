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
//  - MANUEL : Cortex calcule une recommandation, l'affiche à côté de
//    l'objectif actif, et attend une validation explicite (bouton
//    "Appliquer") avant toute écriture — voir `compareCalorieGoal`.
//  - AUTOMATIQUE (Phase 4B) : Cortex peut appliquer une recommandation
//    SANS confirmation à chaque fois, mais uniquement lorsque
//    `evaluateAutoCalorieAdjustment` (ci-dessous) la juge éligible — jamais
//    une écriture aveugle. Persisté dans `nutrition_goals` (migration
//    20260807090000) : `goal`, `target_rate`, `calorie_strategy_mode`
//    (manual par défaut, jamais activé automatiquement par la migration),
//    `last_auto_adjustment_at` (horodatage du dernier ajustement
//    AUTOMATIQUE uniquement — sert de base au cooldown). L'écriture réelle
//    passe par la RPC transactionnelle `apply_calorie_goal_adjustment`
//    (calories + historique `calorie_goal_adjustments` en une opération),
//    jamais directement via un upsert client — voir `useApplyCalorieGoal`.

import { KCAL_PER_KG_BODY_MASS } from "./energyConstants";
import type {
  AdaptiveTdeeCalibrationResult,
  AdaptiveTdeeCalibrationState,
} from "./adaptiveTdeeCalibration";

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

// ---------------------------------------------------------------------
// Mode AUTOMATIQUE — éligibilité d'un ajustement, jamais l'application
// elle-même (voir `useApplyCalorieGoal` côté hooks). Cortex est une PWA :
// aucun scheduler d'arrière-plan fiable n'existe lorsque l'app est fermée.
// Cette fonction est donc conçue pour être évaluée à des moments concrets
// (chargement de Santé nutritionnelle, action utilisateur pertinente) —
// jamais un faux "cron" navigateur. Elle est pure et déterministe : mêmes
// entrées (y compris `now`, fourni par l'appelant plutôt que `Date.now()`
// interne) → même résultat, donc testable et idempotente par construction —
// un re-render répété avec les mêmes données ne produit jamais un résultat
// différent (la protection contre les écritures répétées vient ensuite du
// cooldown lui-même + de l'état de mutation React Query côté appelant).
// ---------------------------------------------------------------------

export const AUTO_CALORIE_ADJUSTMENT_CONFIG = {
  /**
   * Écart minimal, en valeur absolue, pour justifier un ajustement
   * automatique — évite de déclencher un update pour un écart négligeable
   * (bruit résiduel, arrondi). Choisi à 2× le pas d'arrondi
   * (`CALORIE_STRATEGY_ROUNDING_STEP_KCAL`) : nettement au-dessus du bruit
   * d'arrondi lui-même, mais encore assez sensible pour rester utile.
   */
  MIN_AUTO_ADJUSTMENT_KCAL: 50,
  /**
   * Amplitude maximale d'UN SEUL ajustement automatique, kcal — jamais un
   * saut direct vers la recommandation complète (§18/§24 du brief), et
   * dépendante de la fiabilité de la calibration Phase 3B (§19) : plus
   * l'observation est jeune, plus l'automatisation reste prudente, même si
   * l'utilisateur a explicitement activé le mode automatique.
   */
  MAX_AUTO_STEP_KCAL: {
    model_only: 50,
    calibrating: 100,
    adapted: 150,
  } satisfies Record<AdaptiveTdeeCalibrationState, number>,
  /**
   * Délai minimal, en jours, entre deux ajustements AUTOMATIQUES (jamais
   * les `manual_apply`, voir `apply_calorie_goal_adjustment`). Le TDEE
   * observé (Phase 3A) est calculé sur une fenêtre glissante de plusieurs
   * semaines : un ajustement quotidien réagirait au bruit de cette fenêtre
   * plutôt qu'à une vraie tendance, et empêcherait d'observer l'effet d'un
   * changement avant le suivant. 7 jours = la plus petite fenêtre encore
   * jugée "établie" par `ADAPTIVE_TDEE_THRESHOLDS.EARLY.MIN_CALENDAR_DAYS`
   * (Phase 3A) — cohérent avec le grain temporel que le moteur observé
   * peut réellement distinguer du bruit.
   */
  AUTO_ADJUSTMENT_COOLDOWN_DAYS: 7,
} as const;

export type AutoCalorieAdjustmentReason =
  | "manual_mode"
  | "recommendation_unavailable"
  | "current_goal_unavailable"
  | "within_tolerance"
  | "cooldown_active"
  | "eligible";

export interface AutoCalorieAdjustmentResult {
  eligible: boolean;
  reasons: AutoCalorieAdjustmentReason[];
  currentCalories: number | null;
  recommendedCalories: number | null;
  /** `recommended - current`. `null` si l'un des deux manque. */
  differenceKcal: number | null;
  /** Cible à appliquer si `eligible`, sinon `null`. Toujours entre `current` et `recommended`, jamais au-delà. */
  proposedCalories: number | null;
}

export interface AutoCalorieAdjustmentInput {
  mode: CalorieStrategyMode;
  currentCalories: number | null;
  recommendedCalories: number | null;
  /** État de calibration Phase 3B — dimensionne l'amplitude max autorisée. */
  calibrationState: AdaptiveTdeeCalibrationState;
  /** `null` si aucun ajustement automatique n'a encore eu lieu — voir §22, jamais bloqué artificiellement dans ce cas. */
  lastAutoAdjustmentAt: string | null;
  /** "Maintenant", ISO 8601 — fourni par l'appelant pour une fonction pure et testable. */
  now: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function autoAdjustmentResult(
  input: AutoCalorieAdjustmentInput,
  eligible: boolean,
  reasons: AutoCalorieAdjustmentReason[],
  proposedCalories: number | null = null,
): AutoCalorieAdjustmentResult {
  return {
    eligible,
    reasons,
    currentCalories: input.currentCalories,
    recommendedCalories: input.recommendedCalories,
    differenceKcal:
      input.currentCalories != null && input.recommendedCalories != null
        ? input.recommendedCalories - input.currentCalories
        : null,
    proposedCalories,
  };
}

/**
 * Détermine si un ajustement AUTOMATIQUE de `nutrition_goals.calories` est
 * autorisé maintenant, et si oui, la valeur à proposer. Ne modifie rien —
 * purement décisionnel (voir `useApplyCalorieGoal` pour l'écriture réelle).
 */
export function evaluateAutoCalorieAdjustment(
  input: AutoCalorieAdjustmentInput,
): AutoCalorieAdjustmentResult {
  if (input.mode !== "automatic") {
    return autoAdjustmentResult(input, false, ["manual_mode"]);
  }
  if (!isValidPositiveFinite(input.recommendedCalories)) {
    return autoAdjustmentResult(input, false, ["recommendation_unavailable"]);
  }
  if (!isValidPositiveFinite(input.currentCalories)) {
    return autoAdjustmentResult(input, false, ["current_goal_unavailable"]);
  }

  const differenceKcal = input.recommendedCalories - input.currentCalories;

  if (Math.abs(differenceKcal) < AUTO_CALORIE_ADJUSTMENT_CONFIG.MIN_AUTO_ADJUSTMENT_KCAL) {
    return autoAdjustmentResult(input, false, ["within_tolerance"]);
  }

  // Cooldown : uniquement s'il existe un ajustement automatique précédent
  // (§22 — un premier passage en automatique n'est jamais bloqué par le
  // cooldown, mais reste soumis au plafond d'amplitude ci-dessous).
  if (input.lastAutoAdjustmentAt != null) {
    const nowMs = Date.parse(input.now);
    const lastMs = Date.parse(input.lastAutoAdjustmentAt);
    if (Number.isFinite(nowMs) && Number.isFinite(lastMs)) {
      const daysSinceLast = (nowMs - lastMs) / 86_400_000;
      if (daysSinceLast < AUTO_CALORIE_ADJUSTMENT_CONFIG.AUTO_ADJUSTMENT_COOLDOWN_DAYS) {
        return autoAdjustmentResult(input, false, ["cooldown_active"]);
      }
    }
  }

  const maxStep = AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL[input.calibrationState];
  const cappedDelta = clamp(differenceKcal, -maxStep, maxStep);
  const proposedCalories = roundToStep(
    input.currentCalories + cappedDelta,
    CALORIE_STRATEGY_ROUNDING_STEP_KCAL,
  );

  return autoAdjustmentResult(input, true, ["eligible"], proposedCalories);
}
