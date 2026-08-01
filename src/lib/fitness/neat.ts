// Pure domain logic for NEAT (Non-Exercise Activity Thermogenesis) — Phase 2D
// de la refonte Santé nutritionnelle. NEAT ne représente QUE l'activité
// quotidienne non sportive structurée (marche, déplacements, tâches,
// mouvements spontanés) — jamais le BMR, l'EAT, le TEF ni l'objectif
// calorique (métriques indépendantes tant que le TDEE ne les agrège pas).
// No React, no Supabase, no UI tokens.
//
// AUDIT (avant codage, voir compte-rendu Phase 2D) : `daily_activity.
// active_calories` est alimenté par l'import Apple Health depuis la
// quantité HealthKit `HKQuantityTypeIdentifierActiveEnergyBurned`, sommée
// sur toute la journée (src/lib/health/appleHealth.ts) — cette quantité
// Apple **inclut** l'énergie dépensée pendant les séances de sport
// enregistrées ce jour-là (Apple ne sépare pas "exercice structuré" du
// reste de l'activité active dans ce total). `active_calories` PEUT donc
// contenir l'EAT du jour : c'est pourquoi on le retire explicitement
// ci-dessous plutôt que d'utiliser la valeur brute. `daily_activity.steps`
// est de la même façon une somme de tous les échantillons `StepCount` du
// jour (un vrai total journalier, jamais un relevé instantané ni une
// valeur cumulative inter-jours à ne pas re-sommer).
// Aujourd'hui, "apple_health" est la SEULE source de `daily_activity` — si
// une source future a une sémantique différente (dépense active hors
// exercice), cette hypothèse devra être révisée par source.

export type NeatMethod = "wearable_active_calories" | "steps_estimate" | "insufficient_data";
export type NeatSource = "wearable" | "computed" | "none";
export type NeatConfidence = "high" | "medium" | "insufficient";

export interface NeatResult {
  /** null uniquement quand method === "insufficient_data" — jamais un NEAT inventé. */
  kcal: number | null;
  method: NeatMethod;
  source: NeatSource;
  confidence: NeatConfidence;
}

/** Nombre fini et non négatif, sinon `null` — jamais de NaN/Infinity/valeur négative propagée. */
function safeNonNegative(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

// ---------------------------------------------------------------------
// Niveau B — estimation par les pas (conservatrice, même modèle MET ×
// poids × durée que lib/fitness/calories.ts — pas de second système).
// ---------------------------------------------------------------------

/** Longueur de foulée moyenne adulte, mètres — fallback si la taille est absente. */
const AVERAGE_STRIDE_LENGTH_M = 0.75;
/** Ratio foulée/taille usuel pour la marche (~0.41 × taille). */
const STRIDE_TO_HEIGHT_RATIO = 0.0041;
/** MET marche modérée (léger, conservateur — Compendium of Physical Activities). */
const WALKING_MET = 3.0;
/** Vitesse de marche quotidienne usuelle, km/h. */
const AVERAGE_WALKING_SPEED_KMH = 4.8;

function strideLengthM(heightCm: number | null | undefined): number {
  const h = safeNonNegative(heightCm);
  if (h == null || h === 0) return AVERAGE_STRIDE_LENGTH_M;
  return h * STRIDE_TO_HEIGHT_RATIO;
}

/**
 * Estimation conservatrice de la dépense liée à la marche à partir du
 * nombre de pas et du poids (taille optionnelle pour affiner la longueur
 * de foulée). `null` si le nombre de pas ou le poids est absent/invalide —
 * jamais une estimation fabriquée sans donnée de base.
 */
export function estimateStepsCalories(
  steps: number | null | undefined,
  weightKg: number | null | undefined,
  heightCm?: number | null,
): number | null {
  const s = safeNonNegative(steps);
  const w = safeNonNegative(weightKg);
  if (s == null || w == null || w === 0) return null;
  const distanceKm = (s * strideLengthM(heightCm)) / 1000;
  const durationH = distanceKm / AVERAGE_WALKING_SPEED_KMH;
  return Math.round(WALKING_MET * w * durationH);
}

export interface NeatInput {
  /** `daily_activity.active_calories` pour le jour demandé. */
  activeCalories: number | null | undefined;
  /** `daily_activity.steps` pour le jour demandé. */
  steps: number | null | undefined;
  weightKg: number | null | undefined;
  heightCm?: number | null;
  /** EAT du même jour (computeDailyEAT(...).kcal) — retiré des calories actives (Niveau A). */
  eatKcal: number | null | undefined;
}

/**
 * NEAT du jour. Priorité stricte — une seule méthode retenue, jamais deux
 * sources combinées/additionnées :
 *  A) calories actives d'une source santé (`activeCalories`), moins l'EAT
 *     du même jour pour éviter le double comptage (voir audit en tête de
 *     fichier) — clampé à 0, jamais négatif ;
 *  B) sinon, pas + poids (`estimateStepsCalories`) si les calories actives
 *     ne sont pas disponibles/fiables ;
 *  C) sinon, données insuffisantes — jamais de NEAT inventé (pas de
 *     fallback `BMR × coefficient d'activité` dans cette phase).
 */
export function computeNEAT(input: NeatInput): NeatResult {
  const activeCalories = safeNonNegative(input.activeCalories);
  const eat = safeNonNegative(input.eatKcal) ?? 0;

  if (activeCalories != null) {
    return {
      kcal: Math.max(0, activeCalories - eat),
      method: "wearable_active_calories",
      source: "wearable",
      confidence: "high",
    };
  }

  const stepsEstimate = estimateStepsCalories(input.steps, input.weightKg, input.heightCm);
  if (stepsEstimate != null) {
    return {
      kcal: stepsEstimate,
      method: "steps_estimate",
      source: "computed",
      confidence: "medium",
    };
  }

  return { kcal: null, method: "insufficient_data", source: "none", confidence: "insufficient" };
}
