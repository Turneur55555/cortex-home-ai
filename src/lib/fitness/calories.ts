/**
 * Estimation réaliste des calories brûlées sur une séance sportive, basée
 * sur les valeurs MET du Compendium of Physical Activities (Ainsworth).
 *
 * Formule de base : kcal = MET × poids (kg) × durée (h)
 *
 * Références MET utilisées :
 *  - Musculation légère / technique : 3.5
 *  - Musculation modérée (par défaut) : 5.0
 *  - Musculation intense / supersets : 6.0
 *  - Cardio / circuit training vigoureux : 8.0
 *
 * Sans poids corporel, on utilise une valeur par défaut conservatrice de 70 kg.
 *
 * ⚠️ MUSCULATION : depuis la refonte du 04/08/2026, `estimateWorkoutCalories`
 * ci-dessous (durée totale × MET dérivé du tonnage/minute) N'EST PLUS utilisée
 * pour la discipline "muscu" — voir `estimateStrengthCalories` plus bas, qui
 * ne compte que le temps actif des séries validées (aucune calorie pour le
 * repos ni pour une séance restée ouverte trop longtemps). Cette fonction et
 * `deriveIntensity` restent la seule source pour les AUTRES disciplines
 * (course, cardio, HYROX, freeform...) dont la dépense dépend légitimement
 * de la durée — voir eat.ts.
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
    typeof bodyWeightKg === "number" && bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_BODYWEIGHT_KG;
  const level = intensity ?? deriveIntensity(volumeKg, durationMinutes);
  const met = MET_BY_INTENSITY[level];
  const kcal = met * weight * (durationMinutes / 60);
  return Math.round(kcal);
}

/**
 * ── Moteur calorique musculation (séries validées uniquement) ──────────────
 *
 * Temps d'exécution conservateur d'UNE répétition, en secondes. Ne représente
 * QUE la phase active (concentrique + excentrique), jamais le repos entre
 * séries.
 *
 * Constante documentée faute de convention préexistante dans le projet (aucune
 * valeur "secondes/répétition" n'était utilisée nulle part avant cette
 * refonte). Choisie délibérément basse : les tempos de musculation usuels
 * prescrits en coaching (ex. "2/0/2", "3/1/3") s'étalent plutôt entre 3 et 6
 * secondes par répétition ; 2.5 s représente un tempo rapide/contrôlé
 * (~1.25 s concentrique + ~1.25 s excentrique, sans pause), volontairement en
 * dessous de cette fourchette pour ne jamais surestimer la dépense. Centralisée
 * ici pour rester ajustable en un seul endroit si une meilleure référence
 * apparaît plus tard.
 */
export const CONSERVATIVE_SECONDS_PER_REP = 2.5;

export interface EstimateStrengthCaloriesInput {
  /** Temps actif cumulé (secondes) — somme des séries validées, voir
   *  `workoutActiveSeconds` dans strength.ts. Jamais de temps de repos. */
  activeSeconds: number;
  /** Poids corporel (kg) ; fallback 70 si non renseigné/invalide. */
  bodyWeightKg?: number | null;
}

/**
 * Estimation calorique conservatrice d'une séance de musculation à partir du
 * SEUL temps actif des séries validées (voir doc de tête de fichier). Les
 * séries validées sont considérées comme réalisées à effort élevé — MET
 * "intense" (6.0) fixe, plus de dérivation depuis le tonnage/minute.
 * Retourne null si aucun temps actif n'a pu être déterminé (ex. séance
 * ancienne sans reps ni séries détaillées) : fallback conservateur assumé —
 * on ne calcule rien plutôt que d'inventer une donnée.
 */
export function estimateStrengthCalories({
  activeSeconds,
  bodyWeightKg,
}: EstimateStrengthCaloriesInput): number | null {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return null;
  const weight =
    typeof bodyWeightKg === "number" && bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_BODYWEIGHT_KG;
  const met = MET_BY_INTENSITY.intense;
  const kcal = met * weight * (activeSeconds / 3600);
  return Math.round(kcal);
}

/** Formate une estimation calorique affichée à l'utilisateur ("≈145 kcal") —
 *  jamais de fausse précision sur une valeur qui reste une estimation. */
export function formatEstimatedKcal(kcal: number): string {
  return `≈${Math.round(kcal)}`;
}
