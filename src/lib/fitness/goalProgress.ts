// Pure domain logic — PROGRESSION RÉELLE vs. trajectoire (Phase 8). No
// React, no Supabase, no UI tokens.
//
// Réutilise le lissage/la régression poids DÉJÀ existants
// (`adaptiveTdee.ts`, moyenne glissante 7 jours + régression linéaire) —
// ce module ne recalcule JAMAIS un poids lissé lui-même (§22 du brief) :
// il consomme `weeklyTrendKg`/`measurementCount`/`window.calendarDays`
// produits par `computeAdaptiveTdee(...).weight`, calculés une seule fois
// par `sante-nutritionnelle.tsx` et déjà présents dans le rendu.

export type GoalProgressState =
  | "insufficient_data"
  | "on_track"
  | "ahead"
  | "behind"
  | "maintaining";

/**
 * Fenêtre minimale avant de juger une progression (§27 du brief). Le
 * projet utilise déjà 7 jours (lissage TDEE) et 28 jours (fenêtre
 * d'analyse TDEE adaptatif) — 14 jours est retenu ici comme le minimum
 * cohérent : deux fenêtres de lissage complètes, suffisant pour qu'une
 * régression linéaire ne soit pas dominée par le bruit d'une seule pesée,
 * mais sans attendre un mois complet avant le premier retour utilisateur.
 * Règle produit documentée, pas une certitude scientifique.
 */
export const GOAL_PROGRESS_MIN_WINDOW_DAYS = 14;

/** En-dessous de ce nombre de pesées sur la fenêtre, le signal est jugé trop bruité pour classer la progression (§26). */
export const GOAL_PROGRESS_MIN_MEASUREMENTS = 4;

/**
 * Tolérance autour du rythme cible (§25) : un écart de ±25% entre le
 * rythme réellement observé et le rythme visé reste "on_track" — évite de
 * classer -0.48 kg/semaine comme "behind" quand la cible est -0.50.
 * Centralisée, documentée, pas une valeur cachée dans un composant.
 */
export const GOAL_PROGRESS_TOLERANCE_PERCENT = 25;

/** En-dessous de cette magnitude (kg/semaine), un mouvement est un plateau/bruit, pas une progression dans un sens ou l'autre — évite de classer un quasi-zéro comme "behind" à cause d'un signe erratique. */
const PLATEAU_EPSILON_KG_PER_WEEK = 0.05;

export interface GoalProgressInput {
  goal: "fat_loss" | "maintenance" | "muscle_gain";
  /** Depuis `computeGoalTrajectory` — signé, kg/semaine au poids actuel. `null` pour `maintenance` ou si non calculable. */
  weeklyTargetChangeKg: number | null;
  /** Uniquement pour `maintenance` — demi-largeur de la zone (`computeGoalTrajectory().maintenanceZoneKg`), en kg. */
  maintenanceToleranceKg: number | null;
  /** Depuis `computeAdaptiveTdee(...).weight.weeklyTrendKg` — RÉUTILISÉ, jamais recalculé ici. */
  observedWeeklyTrendKg: number | null;
  /** Depuis `computeAdaptiveTdee(...).weight.measurementCount`. */
  measurementCount: number;
  /** Depuis `computeAdaptiveTdee(...).window.calendarDays`. */
  windowCalendarDays: number;
}

export interface GoalProgressResult {
  state: GoalProgressState;
  reason: string;
  observedWeeklyTrendKg: number | null;
  weeklyTargetChangeKg: number | null;
}

function result(
  state: GoalProgressState,
  reason: string,
  input: Pick<GoalProgressInput, "observedWeeklyTrendKg" | "weeklyTargetChangeKg">,
): GoalProgressResult {
  return {
    state,
    reason,
    observedWeeklyTrendKg: input.observedWeeklyTrendKg,
    weeklyTargetChangeKg: input.weeklyTargetChangeKg,
  };
}

/**
 * Compare la progression RÉELLE (poids lissé, réutilisé depuis
 * `adaptiveTdee.ts`) à la trajectoire visée. Ne modifie jamais rien — ne
 * doit jamais être connectée directement à un ajustement calorique/macro
 * (§30/§31 du brief : la seule chaîne d'écriture reste
 * `evaluateAutoCalorieAdjustment`/`evaluateAutoMacroAdjustment`).
 */
export function evaluateGoalProgress(input: GoalProgressInput): GoalProgressResult {
  const hasEnoughData =
    input.observedWeeklyTrendKg != null &&
    input.measurementCount >= GOAL_PROGRESS_MIN_MEASUREMENTS &&
    input.windowCalendarDays >= GOAL_PROGRESS_MIN_WINDOW_DAYS;

  if (!hasEnoughData) {
    return result(
      "insufficient_data",
      `Pas encore assez de pesées récentes pour évaluer la progression (minimum ${GOAL_PROGRESS_MIN_MEASUREMENTS} pesées sur ${GOAL_PROGRESS_MIN_WINDOW_DAYS} jours).`,
      input,
    );
  }

  if (input.goal === "maintenance") {
    const tolerance = input.maintenanceToleranceKg ?? 0;
    const withinZone = Math.abs(input.observedWeeklyTrendKg!) <= tolerance;
    return withinZone
      ? result("maintaining", "Poids stable dans la zone de maintien.", input)
      : result("behind", "Poids en train de dériver hors de la zone de maintien visée.", input);
  }

  if (input.weeklyTargetChangeKg == null) {
    return result(
      "insufficient_data",
      "Rythme cible indisponible pour comparer la progression.",
      input,
    );
  }

  const observed = input.observedWeeklyTrendKg!;
  if (Math.abs(observed) <= PLATEAU_EPSILON_KG_PER_WEEK) {
    return result(
      "maintaining",
      "Poids stable — plateau récent, pas encore de mouvement net.",
      input,
    );
  }

  const sameDirection = Math.sign(observed) === Math.sign(input.weeklyTargetChangeKg);
  if (!sameDirection) {
    return result("behind", "La tendance récente va dans le sens opposé à l'objectif.", input);
  }

  const ratio = Math.abs(observed) / Math.abs(input.weeklyTargetChangeKg);
  const lowerBound = 1 - GOAL_PROGRESS_TOLERANCE_PERCENT / 100;
  const upperBound = 1 + GOAL_PROGRESS_TOLERANCE_PERCENT / 100;

  if (ratio >= lowerBound && ratio <= upperBound) {
    return result("on_track", "Progression conforme au rythme visé.", input);
  }
  if (ratio > upperBound) {
    return result("ahead", "Progression plus rapide que le rythme visé.", input);
  }
  return result("behind", "Progression plus lente que le rythme visé.", input);
}

// ---------------------------------------------------------------------
// Complétion d'objectif (§43) — critère stabilisé, jamais une pesée isolée
// ---------------------------------------------------------------------

/** Écart maximal (kg) entre le poids LISSÉ et la cible pour suggérer une complétion — jamais basé sur une pesée brute isolée. */
export const GOAL_COMPLETION_WEIGHT_TOLERANCE_KG = 0.5;

/**
 * Ne fait que SUGGÉRER qu'un objectif poids semble atteint — n'écrit
 * jamais `status = 'completed'` elle-même (décision utilisateur explicite
 * uniquement, §43 : pas de complétion automatique sur une seule pesée).
 */
export function isWeightGoalLikelyReached(input: {
  targetWeightKg: number | null;
  smoothedCurrentWeightKg: number | null;
  measurementCount: number;
}): boolean {
  if (input.targetWeightKg == null || input.smoothedCurrentWeightKg == null) return false;
  if (input.measurementCount < GOAL_PROGRESS_MIN_MEASUREMENTS) return false;
  return (
    Math.abs(input.smoothedCurrentWeightKg - input.targetWeightKg) <=
    GOAL_COMPLETION_WEIGHT_TOLERANCE_KG
  );
}
