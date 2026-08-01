// Pure domain logic for NEAT (Non-Exercise Activity Thermogenesis) — Phase 2D
// de la refonte Santé nutritionnelle, corrigée pour l'indépendance Cortex
// (règle produit : BMR/EAT/TEF/NEAT/futur TDEE doivent fonctionner sans
// AUCUNE source externe — Apple Health, montres connectées, etc. restent
// des améliorations facultatives, jamais un prérequis). NEAT ne représente
// QUE l'activité quotidienne non sportive (marche, déplacements, tâches,
// mouvements spontanés) — jamais le BMR, l'EAT, le TEF ni l'objectif
// calorique (métriques indépendantes tant que le TDEE ne les agrège pas).
// No React, no Supabase, no UI tokens.
//
// ─── Correction (voir compte-rendu) ──────────────────────────────────────
// La version initiale de cette phase priorisait `daily_activity.
// active_calories`/`steps`, alimentés UNIQUEMENT par l'import Apple Health
// (voir lib/health/appleHealth.ts) — Cortex devenait donc dépendant d'une
// source externe pour afficher un NEAT. Corrigé : la méthode PRINCIPALE est
// désormais "Cortex-native" (profil métabolique seul, aucune donnée
// externe). Les méthodes wearable/pas restent disponibles en repli optionnel
// pour ne pas jeter le travail de l'audit Phase 2D, mais ne sont plus jamais
// nécessaires au fonctionnement du moteur.
//
// AUDIT ACTIVE_CALORIES (conservé, toujours pertinent si un jour réactivé) :
// `daily_activity.active_calories` est alimenté par l'import Apple Health
// depuis la quantité HealthKit `HKQuantityTypeIdentifierActiveEnergyBurned`,
// sommée sur toute la journée — cette quantité Apple **inclut** l'énergie
// dépensée pendant les séances de sport enregistrées ce jour-là (Apple ne
// sépare pas "exercice structuré" du reste de l'activité active). C'est
// pourquoi la méthode wearable retire explicitement l'EAT du jour plutôt que
// d'utiliser la valeur brute. `daily_activity.steps` est une somme de tous
// les échantillons `StepCount` du jour (un vrai total journalier, jamais un
// relevé instantané). "apple_health" reste la SEULE source de
// `daily_activity` aujourd'hui.

// ---------------------------------------------------------------------
// Méthode principale — Cortex-native (profil métabolique seul).
// ---------------------------------------------------------------------

/**
 * Niveaux d'activité quotidienne HORS SPORT — distincts des multiplicateurs
 * TDEE classiques (1.2/1.375/1.55/1.725/1.9, voir `metabolism.ts`
 * ACTIVITY_LEVELS) : ceux-ci décrivent la dépense totale journalière en y
 * incluant l'exercice, ce que Cortex calcule déjà séparément via l'EAT — les
 * réutiliser tels quels pour le NEAT compterait le sport deux fois.
 *
 * Ces coefficients s'appliquent au BMR et représentent une fourchette
 * usuelle de la part du NEAT dans la dépense journalière selon le niveau
 * d'activité professionnelle/quotidienne (littérature NEAT — Levine et al.,
 * variations occupationnelles de ~15 % à ~50 % de la dépense journalière
 * hors exercice structuré). Valeurs centrales, conservatrices,
 * volontairement simples — à ajuster ici si de meilleures valeurs sont
 * retenues, sans toucher au reste du code.
 */
export const NEAT_ACTIVITY_LEVELS = [
  {
    value: 0.15,
    label: "Très sédentaire",
    description: "Travail principalement assis, très peu de déplacements.",
  },
  {
    value: 0.25,
    label: "Peu actif",
    description: "Travail assis mais déplacements réguliers dans la journée.",
  },
  {
    value: 0.35,
    label: "Actif",
    description: "Beaucoup de marche ou travail régulièrement debout.",
  },
  {
    value: 0.5,
    label: "Très actif",
    description:
      "Travail physique ou déplacements importants pendant la majeure partie de la journée.",
  },
] as const;

export type NeatActivityLevelValue = (typeof NEAT_ACTIVITY_LEVELS)[number]["value"];

/** Vérifie qu'une valeur numérique correspond bien à un niveau NEAT connu. */
export function isNeatActivityLevel(
  value: number | null | undefined,
): value is NeatActivityLevelValue {
  return NEAT_ACTIVITY_LEVELS.some((l) => l.value === value);
}

/** Nombre fini et non négatif, sinon `null` — jamais de NaN/Infinity/valeur négative propagée. */
function safeNonNegative(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

/**
 * NEAT Cortex-native = BMR × niveau d'activité quotidienne hors sport.
 * `null` si le BMR ou le niveau d'activité déclaré est absent/invalide —
 * jamais un NEAT inventé. Le sport (EAT) n'entre JAMAIS dans ce calcul :
 * seul le niveau d'activité "hors sport" déclaré par l'utilisateur compte,
 * c'est pourquoi cette fonction ne prend même pas l'EAT en paramètre.
 */
export function estimateNeatFromActivityLevel(
  bmr: number | null | undefined,
  activityLevel: number | null | undefined,
): number | null {
  const b = safeNonNegative(bmr);
  if (b == null || b === 0 || !isNeatActivityLevel(activityLevel)) return null;
  return Math.round(b * activityLevel);
}

// ---------------------------------------------------------------------
// Méthode de repli optionnelle — pas + poids (Cortex seul si les pas sont
// saisis manuellement, mais alimenté aujourd'hui uniquement par l'import
// Apple Health). Même modèle MET × poids × durée que lib/fitness/calories.ts
// — pas de second système concurrent.
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

// ---------------------------------------------------------------------
// Moteur NEAT — priorité stricte, une seule méthode retenue.
// ---------------------------------------------------------------------

export type NeatMethod =
  | "cortex_native"
  | "wearable_active_calories"
  | "steps_estimate"
  | "insufficient_data";
export type NeatSource = "profile" | "wearable" | "computed" | "none";
export type NeatConfidence = "medium" | "high" | "insufficient";

export interface NeatResult {
  /** null uniquement quand method === "insufficient_data" — jamais un NEAT inventé. */
  kcal: number | null;
  method: NeatMethod;
  source: NeatSource;
  confidence: NeatConfidence;
}

export interface NeatInput {
  /** BMR du jour (computeBMR) — source du calcul Cortex-native, méthode principale. */
  bmr: number | null | undefined;
  /** Niveau d'activité quotidienne HORS SPORT déclaré (metabolic_profile.activity_level). */
  activityLevel: number | null | undefined;
  /**
   * Repli optionnel (jamais requis) — `daily_activity.active_calories` du
   * jour, alimenté aujourd'hui uniquement par l'import Apple Health.
   */
  activeCalories?: number | null;
  /** Repli optionnel — `daily_activity.steps` du jour (même source qu'active_calories). */
  steps?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  /** EAT du même jour — retiré des calories actives wearable uniquement (méthode de repli). */
  eatKcal?: number | null;
}

/**
 * NEAT du jour. Priorité stricte — une seule méthode retenue, jamais deux
 * sources combinées/additionnées :
 *  1) **Cortex-native** (méthode principale, aucune donnée externe requise) :
 *     BMR × niveau d'activité quotidienne hors sport déclaré dans le profil
 *     métabolique. Fonctionne pour tout utilisateur ayant renseigné son
 *     profil et son poids — même sans connecter la moindre source externe ;
 *  2) sinon, repli optionnel — calories actives d'une source santé
 *     (`activeCalories`), moins l'EAT du même jour pour éviter le double
 *     comptage — clampé à 0, jamais négatif ;
 *  3) sinon, repli optionnel — pas + poids (`estimateStepsCalories`) ;
 *  4) sinon, données insuffisantes — jamais de NEAT inventé (pas de
 *     fallback générique `BMR × coefficient d'activité classique`).
 * Les méthodes 2 et 3 restent disponibles pour un futur enrichissement
 * facultatif (Apple Health, Garmin, Whoop…) mais ne sont jamais nécessaires :
 * le moteur reste pleinement fonctionnel si toutes les intégrations
 * externes étaient supprimées.
 */
export function computeNEAT(input: NeatInput): NeatResult {
  const nativeEstimate = estimateNeatFromActivityLevel(input.bmr, input.activityLevel);
  if (nativeEstimate != null) {
    return {
      kcal: nativeEstimate,
      method: "cortex_native",
      source: "profile",
      confidence: "medium",
    };
  }

  const activeCalories = safeNonNegative(input.activeCalories);
  if (activeCalories != null) {
    const eat = safeNonNegative(input.eatKcal) ?? 0;
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
