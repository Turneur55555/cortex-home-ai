// Pure domain logic for the TDEE (Total Daily Energy Expenditure) engine —
// Phase 2E de la refonte Santé nutritionnelle. Le TDEE est une DÉPENSE
// modélisée, jamais un objectif alimentaire : il agrège les quatre
// composantes déjà calculées séparément par Cortex (BMR, NEAT, EAT, TEF),
// sans en ajouter d'autres. No React, no Supabase, no UI tokens.
//
// TDEE = BMR + NEAT + EAT + TEF — rien d'autre. Pas d'objectif calorique,
// pas de déficit/surplus souhaité, pas de prédiction, pas d'adaptation
// métabolique (ce sera un futur "TDEE adaptatif", clairement distinct de ce
// TDEE modélisé).

import type { NeatMethod } from "./neat";

export interface TDEEComponents {
  /** kcal/j, ou `null` si le profil métabolique est incomplet. */
  bmr: number | null;
  /** kcal/j, ou `null` si aucune méthode NEAT n'est exploitable (voir neat.ts). */
  neat: number | null;
  /** kcal/j — TOUJOURS une valeur réelle (0 = aucune séance aujourd'hui, jamais "inconnu"). */
  eat: number;
  /** kcal/j — TOUJOURS une valeur réelle (0 = aucun macro consommé aujourd'hui, jamais "inconnu"). */
  tef: number;
}

export type TDEEStatus = "complete" | "incomplete";

/**
 * Niveau de confiance — indicateur RELATIF de la qualité des données
 * sources, pas un pourcentage scientifique. Dérivé de la composante la
 * plus incertaine du calcul (aujourd'hui : la méthode NEAT retenue,
 * puisque BMR/EAT/TEF sont toujours les mêmes moteurs Cortex-native) :
 *  - "high"   : NEAT mesuré par une source santé (active_calories − EAT) ;
 *  - "medium" : NEAT Cortex-native (profil déclaratif) — cas par défaut ;
 *  - "low"    : NEAT estimé à partir des pas (double estimation : pas → MET).
 */
export type TDEEConfidence = "high" | "medium" | "low";

export interface DailyTDEE {
  /** Somme des 4 composantes, ou `null` si `status === "incomplete"`. */
  totalKcal: number | null;
  components: TDEEComponents;
  status: TDEEStatus;
  /** `null` uniquement quand `status === "incomplete"` — pas de confiance sans total. */
  confidence: TDEEConfidence | null;
}

function safeNonNegative(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function confidenceFromNeatMethod(method: NeatMethod): TDEEConfidence {
  switch (method) {
    case "wearable_active_calories":
      return "high";
    case "steps_estimate":
      return "low";
    case "cortex_native":
    default:
      return "medium";
  }
}

export interface TDEEInput {
  /** BMR du jour (computeBMR) — `null` si le profil métabolique est incomplet. */
  bmr: number | null | undefined;
  /** kcal NEAT du jour + méthode retenue (computeNEAT) — kcal `null` si insuffisant. */
  neat: { kcal: number | null; method: NeatMethod };
  /** EAT du jour (computeDailyEAT(...).kcal) — toujours un nombre, 0 valide. */
  eatKcal: number | null | undefined;
  /** TEF du jour (computeTEF(...).totalKcal) — toujours un nombre, 0 valide. */
  tefKcal: number | null | undefined;
}

/**
 * TDEE du jour = BMR + NEAT + EAT + TEF. Fonctionne pour n'importe quelle
 * date : cette fonction ne connaît pas de date, elle agrège des composantes
 * déjà calculées par l'appelant pour le jour demandé (mêmes conventions que
 * `computeTEF`/`computeDailyEAT`/`computeNEAT`).
 *
 * `status` distingue explicitement :
 *  - "complete"   : BMR ET NEAT sont tous deux disponibles (EAT/TEF sont
 *                   TOUJOURS disponibles — 0 est une vraie valeur, jamais
 *                   une donnée manquante) → `totalKcal` est un nombre ;
 *  - "incomplete" : BMR ou NEAT manque → `totalKcal` reste `null`. Ne JAMAIS
 *                   transformer silencieusement une composante inconnue en
 *                   0 dans le total — un total partiel serait trompeur
 *                   (ex. BMR=1650, EAT=300, TEF=200, NEAT=inconnu ne doit
 *                   jamais afficher "TDEE = 2150").
 */
export function computeDailyTDEE(input: TDEEInput): DailyTDEE {
  const bmr = safeNonNegative(input.bmr);
  const neat = safeNonNegative(input.neat.kcal);
  const eat = safeNonNegative(input.eatKcal) ?? 0;
  const tef = safeNonNegative(input.tefKcal) ?? 0;

  const components: TDEEComponents = { bmr, neat, eat, tef };

  if (bmr == null || neat == null) {
    return { totalKcal: null, components, status: "incomplete", confidence: null };
  }

  return {
    totalKcal: Math.round(bmr + neat + eat + tef),
    components,
    status: "complete",
    confidence: confidenceFromNeatMethod(input.neat.method),
  };
}

// ---------------------------------------------------------------------
// Préparation (moteur prêt, UI reportée à une phase ultérieure — voir
// compte-rendu §16) : écart THÉORIQUE entre l'objectif calorique déclaré
// (nutrition_goals.calories) et le TDEE modélisé. À ne jamais confondre
// avec le déficit/surplus RÉELLEMENT consommé de la journée (qui dépend
// des calories réellement ingérées, pas de l'objectif déclaré) — d'où le
// nom "gap" et non "deficit réel".
// ---------------------------------------------------------------------

export interface CalorieGoalGap {
  /** objectif − TDEE. Négatif = déficit cible, positif = surplus cible. */
  gapKcal: number;
}

/**
 * Écart cible = objectif calorique − TDEE modélisé. `null` si le TDEE
 * n'est pas complet ou si aucun objectif calorique n'est défini — jamais
 * une comparaison approximative avec un TDEE ou un objectif inconnu.
 */
export function computeCalorieGoalGap(
  tdeeTotalKcal: number | null,
  calorieGoalKcal: number | null | undefined,
): CalorieGoalGap | null {
  if (
    tdeeTotalKcal == null ||
    typeof calorieGoalKcal !== "number" ||
    !Number.isFinite(calorieGoalKcal)
  ) {
    return null;
  }
  return { gapKcal: Math.round(calorieGoalKcal - tdeeTotalKcal) };
}
