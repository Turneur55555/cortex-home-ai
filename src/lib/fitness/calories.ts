/**
 * Estimation réaliste des calories brûlées sur une séance de musculation,
 * basée sur les valeurs MET du Compendium of Physical Activities (Ainsworth).
 *
 * Formule de base : kcal = MET × poids (kg) × durée (h)
 *
 * Références MET utilisées :
 *  - Musculation légère / technique : 3.5
 *  - Musculation modérée (par défaut) : 5.0
 *  - Musculation intense / supersets : 6.0
 *  - Cardio / circuit training vigoureux : 8.0
 *
 * L'intensité est dérivée du rapport tonnage (kg) / durée (min) lorsqu'elle
 * n'est pas fournie. Sans poids corporel, on utilise une valeur par défaut
 * conservatrice de 70 kg.
 *
 * Cibles : musculation modérée ≈ 3–6 kcal/min, intense ≈ 5–8 kcal/min.
 * Une séance de 60 min à 70 kg renvoie donc ≈ 210–420 kcal — bien loin des
 * 800–1200 kcal incohérents produits par l'ancien algorithme.
 */

export type WorkoutIntensity = "light" | "moderate" | "intense" | "cardio";

const MET_BY_INTENSITY: Record<WorkoutIntensity, number> = {
  light: 3.5,
  moderate: 5.0,
  intense: 6.0,
  cardio: 8.0,
};

const DEFAULT_BODYWEIGHT_KG = 70;

export interface EstimateCaloriesInput {
  /** Durée réelle de la séance en minutes. */
  durationMinutes: number;
  /** Tonnage total (kg) — Σ reps × poids. */
  volumeKg: number;
  /** Poids corporel (kg) ; fallback 70 si non renseigné. */
  bodyWeightKg?: number | null;
  /** Intensité forcée ; sinon dérivée du volume/minute. */
  intensity?: WorkoutIntensity;
}

export function deriveIntensity(volumeKg: number, durationMinutes: number): WorkoutIntensity {
  if (durationMinutes <= 0) return "moderate";
  const volPerMin = volumeKg / durationMinutes;
  if (volPerMin >= 120) return "intense";
  if (volPerMin >= 40) return "moderate";
  return "light";
}

export function estimateWorkoutCalories({
  durationMinutes,
  volumeKg,
  bodyWeightKg,
  intensity,
}: EstimateCaloriesInput): number | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const weight =
    typeof bodyWeightKg === "number" && bodyWeightKg > 0
      ? bodyWeightKg
      : DEFAULT_BODYWEIGHT_KG;
  const level = intensity ?? deriveIntensity(volumeKg, durationMinutes);
  const met = MET_BY_INTENSITY[level];
  const kcal = met * weight * (durationMinutes / 60);
  return Math.round(kcal);
}
