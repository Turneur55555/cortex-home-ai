// Pure domain logic for EAT (Exercise Activity Thermogenesis) — Phase 2B de
// la refonte Santé nutritionnelle. EAT ne représente QUE l'énergie dépensée
// pendant les activités sportives enregistrées (jamais le NEAT/TEF/TDEE).
// No React, no Supabase, no UI tokens.

import {
  CONSERVATIVE_SECONDS_PER_REP,
  estimateStrengthCalories,
  estimateWorkoutCalories,
} from "./calories";
import { workoutActiveSeconds } from "./strength";

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
export type CalorieEstimateMethod = "reps_active_time" | "met_duration";

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
 * Musculation hybride (2026-08-04) — durée active cumulée (secondes) des
 * BLOCS métriques (course/cardio/HYROX/autre) ajoutés à une séance muscu,
 * lue depuis `workouts.metadata.segments` (resynchronisé à la clôture, voir
 * useFinishWorkout). Ne lit QUE `metrics.duration_s` explicitement déclaré
 * par l'utilisateur/le moteur — jamais de durée inventée à partir d'une
 * distance ou d'un nombre de répétitions (cohérent avec le reste du fichier :
 * "jamais de chiffre inventé"). Une séance hybride sans aucune durée de bloc
 * renseignée ne compte donc que la part musculation — sous-estimation
 * assumée plutôt qu'un chiffre fabriqué.
 */
function readMetadataSegmentActiveSeconds(metadata: unknown): number {
  if (typeof metadata !== "object" || metadata === null) return 0;
  const segments = (metadata as Record<string, unknown>).segments;
  if (!Array.isArray(segments)) return 0;
  let seconds = 0;
  for (const seg of segments) {
    if (typeof seg !== "object" || seg === null) continue;
    const metrics = (seg as Record<string, unknown>).metrics;
    if (typeof metrics !== "object" || metrics === null) continue;
    const duration = (metrics as Record<string, unknown>).duration_s;
    if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
      seconds += duration;
    }
  }
  return seconds;
}

/**
 * Estimation calorique d'UNE séance, quelle que soit sa discipline.
 * Priorité :
 *  1) estimation déjà produite par le moteur de la discipline (ex. Guided :
 *     kcalPerMinute × durée, voir engines/guidedEngine.ts) — jamais recalculée ;
 *  2) musculation : UNIQUEMENT le temps actif des séries validées (répétitions
 *     × durée conservatrice/répétition) — jamais la durée totale de la séance
 *     ni le tonnage/minute. Voir `estimateStrengthCalories`/`workoutActiveSeconds`.
 *     Corriger `duration_minutes` d'une séance musculation ne change donc
 *     jamais ses calories : seules les séries comptent ;
 *  3) autres disciplines (cardio/course/HYROX/freeform) : pas de tonnage
 *     pertinent (0 kg de charge ne veut pas dire un effort léger pour une
 *     course ou un HYROX) → formule MET × poids × durée totale, intensité
 *     "modérée" explicite plutôt que la dérivation volume/durée qui
 *     retomberait à tort sur "light". Pour ces disciplines, la durée reste
 *     un facteur légitime de la dépense — comportement inchangé.
 * Retourne null si la durée est absente/nulle (séance non terminée) — ce
 * garde-fou sert uniquement à détecter une séance non close, pas à alimenter
 * le calcul musculation.
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
    const activeSeconds = workoutActiveSeconds(
      workout.exercises ?? [],
      CONSERVATIVE_SECONDS_PER_REP,
    );
    const strengthKcal = estimateStrengthCalories({
      activeSeconds,
      bodyWeightKg: bodyWeightKg ?? null,
    });
    // Musculation hybride (2026-08-04) : les blocs métriques (course/cardio/
    // HYROX/autre) éventuellement ajoutés à cette séance muscu ont leur
    // propre dépense — jamais comptée deux fois avec le temps actif des
    // séries ci-dessus (source disjointe : exercise_sets vs metadata.segments)
    // ni recalculée depuis la durée totale de la séance (voir doc de tête de
    // fichier, point 2). Ajoutée UNIQUEMENT si une durée de bloc est
    // explicitement connue — jamais de chiffre inventé.
    const segmentSeconds = readMetadataSegmentActiveSeconds(workout.metadata);
    const segmentKcal =
      segmentSeconds > 0
        ? estimateWorkoutCalories({
            durationMinutes: segmentSeconds / 60,
            volumeKg: 0,
            bodyWeightKg: bodyWeightKg ?? null,
            intensity: "moderate",
          })
        : null;
    const kcal = (strengthKcal ?? 0) + (segmentKcal ?? 0);
    if (kcal <= 0) return null;
    return { kcal, source: "computed", method: "reps_active_time", confidence: "estimate" };
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
