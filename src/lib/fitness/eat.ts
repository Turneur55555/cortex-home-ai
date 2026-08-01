// Pure domain logic for EAT (Exercise Activity Thermogenesis) — Phase 2B de
// la refonte Santé nutritionnelle. EAT ne représente QUE l'énergie dépensée
// pendant les activités sportives enregistrées (jamais le NEAT/TEF/TDEE).
// No React, no Supabase, no UI tokens.

import { estimateWorkoutCalories } from "./calories";
import { workoutTonnage } from "./strength";

type SetForEAT = {
  reps?: number | string | null;
  weight?: number | string | null;
  completed?: boolean | null;
};

type ExerciseForEAT = {
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  exercise_sets?: SetForEAT[] | null;
};

export type WorkoutForEAT = {
  date: string;
  /** Défaut "muscu" si absent — même convention que WorkoutCard.tsx. */
  discipline?: string | null;
  duration_minutes: number | null;
  exercises?: ExerciseForEAT[] | null;
  /** Certaines disciplines (Guided) y stockent déjà une estimation calorique.
   *  Type large (`unknown`) car reflète la colonne Supabase `Json`. */
  metadata?: unknown;
};

const STRENGTH_DISCIPLINE = "muscu";

/**
 * Origine de l'estimation — prépare l'architecture pour de futures sources
 * externes (Apple Health, Apple Watch, Garmin, Whoop, Fitbit…) sans encore
 * les implémenter. Seul "computed" existe aujourd'hui.
 */
export type CalorieEstimateSource = "computed" | "device";

/** Méthode ayant produit l'estimation — utile pour l'audit/debug, jamais affiché tel quel à l'utilisateur. */
export type CalorieEstimateMethod = "met_volume" | "met_duration";

export interface CalorieEstimate {
  kcal: number;
  source: CalorieEstimateSource;
  method: CalorieEstimateMethod;
  /**
   * Niveau de confiance — volontairement un type à une seule valeur en V1
   * (pas de scoring). Prépare l'emplacement pour une échelle future
   * ("estimate" | "measured" | ...) sans construire ce système maintenant.
   */
  confidence: "estimate";
}

function readMetadataCalories(metadata: unknown): number | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  const raw = record.caloriesEstimate ?? record.calories_estimate;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

/**
 * Estimation calorique d'UNE séance, quelle que soit sa discipline.
 * Priorité :
 *  1) estimation déjà produite par le moteur de la discipline (ex. Guided :
 *     kcalPerMinute × durée, voir engines/guidedEngine.ts) — jamais recalculée ;
 *  2) musculation : tonnage réel disponible → estimateWorkoutCalories avec
 *     intensité dérivée du volume (comportement inchangé de WorkoutCard) ;
 *  3) autres disciplines (cardio/course/HYROX/freeform) : pas de tonnage
 *     pertinent (0 kg de charge ne veut pas dire un effort léger pour une
 *     course ou un HYROX) → même formule MET × poids × durée, intensité
 *     "modérée" explicite plutôt que la dérivation volume/durée qui
 *     retomberait à tort sur "light".
 * Retourne null si la durée est absente/nulle (séance non terminée).
 */
export function estimateSessionCalories(
  workout: WorkoutForEAT,
  bodyWeightKg: number | null | undefined,
): CalorieEstimate | null {
  const duration = workout.duration_minutes ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const fromMetadata = readMetadataCalories(workout.metadata);
  if (fromMetadata != null) {
    return {
      kcal: fromMetadata,
      source: "computed",
      method: "met_duration",
      confidence: "estimate",
    };
  }

  const isStrength = (workout.discipline ?? STRENGTH_DISCIPLINE) === STRENGTH_DISCIPLINE;
  if (isStrength) {
    const volume = workoutTonnage(workout.exercises ?? []);
    const kcal = estimateWorkoutCalories({
      durationMinutes: duration,
      volumeKg: volume,
      bodyWeightKg: bodyWeightKg ?? null,
    });
    if (kcal == null) return null;
    return { kcal, source: "computed", method: "met_volume", confidence: "estimate" };
  }

  const kcal = estimateWorkoutCalories({
    durationMinutes: duration,
    volumeKg: 0,
    bodyWeightKg: bodyWeightKg ?? null,
    intensity: "moderate",
  });
  if (kcal == null) return null;
  return { kcal, source: "computed", method: "met_duration", confidence: "estimate" };
}

export interface DailyEAT {
  /** Somme des estimations valides du jour, kcal. 0 si aucune séance. */
  kcal: number;
  /** Nombre de séances enregistrées ce jour-là (données valides ou non). */
  sessionCount: number;
  confidence: "estimate";
}

/**
 * EAT (Exercise Activity Thermogenesis) du jour `dateYMD` — somme des
 * calories estimées des séances réellement enregistrées ce jour-là.
 * Aucune séance ⇒ { kcal: 0, sessionCount: 0 } : jamais d'activité inventée.
 * Paramétré par date (pas seulement "aujourd'hui") pour pouvoir alimenter
 * de futurs historiques/moyennes 7j/30j sans changer cette fonction.
 */
export function computeDailyEAT(
  workouts: ReadonlyArray<WorkoutForEAT> | undefined,
  bodyWeightKg: number | null | undefined,
  dateYMD: string,
): DailyEAT {
  const sessions = (workouts ?? []).filter((w) => w.date === dateYMD);
  let kcal = 0;
  for (const w of sessions) {
    const estimate = estimateSessionCalories(w, bodyWeightKg);
    if (estimate != null) kcal += estimate.kcal;
  }
  return { kcal: Math.round(kcal), sessionCount: sessions.length, confidence: "estimate" };
}
