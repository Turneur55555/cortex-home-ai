// ============================================================
// Modèle de profil utilisateur pour l'analyse (domaine pur).
// Utilise EN PRIORITÉ les données du module Corps (body_tracking) et les
// objectifs. Si l'utilisateur a défini un objectif explicite, il fait foi ;
// sinon on l'infère automatiquement à partir des données réellement
// disponibles. Aucun champ n'est requis → un profil vide reste analysable
// (repli « forme générale »).
// ============================================================

import type { TrainingObjective } from "./types";

/** Une ligne de mensuration (sous-ensemble de body_tracking). */
export interface BodyRow {
  date: string;
  weight?: number | null;
  body_fat?: number | null;
  muscle_mass?: number | null;
  waist?: number | null;
}

export interface GoalRow {
  goal_type: string;
  is_completed?: boolean | null;
}

export interface ProfileInput {
  /** Objectif choisi explicitement par l'utilisateur (surcharge l'inférence). */
  explicitObjective?: TrainingObjective | null;
  /** Mensurations, triées par date DESC (comme useBodyMeasurements). */
  body?: ReadonlyArray<BodyRow> | null;
  goals?: ReadonlyArray<GoalRow> | null;
  /** Moyenne des répétitions du top set sur l'historique de l'exercice. */
  avgReps?: number | null;
}

export interface UserProfileContext {
  objective: TrainingObjective;
  /** true si l'objectif a été choisi explicitement (vs inféré). */
  explicit: boolean;
  hasBodyData: boolean;
  latestWeight: number | null;
  latestBodyFat: number | null;
  latestMuscleMass: number | null;
  /** Tendance de la masse grasse : <0 = en baisse (bon signe pour une sèche). */
  bodyFatTrend: number | null;
  muscleMassTrend: number | null;
}

function firstNonNull<T extends keyof BodyRow>(
  rows: ReadonlyArray<BodyRow>,
  field: T,
): number | null {
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Différence entre la valeur la plus récente et la plus ancienne disponible. */
function trend<T extends keyof BodyRow>(
  rows: ReadonlyArray<BodyRow>,
  field: T,
): number | null {
  const values: number[] = [];
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number" && Number.isFinite(v)) values.push(v);
  }
  if (values.length < 2) return null;
  // rows sont DESC → values[0] = plus récent, dernier = plus ancien.
  return values[0] - values[values.length - 1];
}

/**
 * Infère l'objectif d'entraînement à partir des données disponibles.
 * Priorité : objectif explicite > signaux Corps/objectifs > plage de reps.
 */
export function inferObjective(input: ProfileInput): TrainingObjective {
  if (input.explicitObjective) return input.explicitObjective;

  const goals = input.goals ?? [];
  const activeWeightLoss = goals.some(
    (g) => g.goal_type === "weight_loss" && !g.is_completed,
  );
  if (activeWeightLoss) return "seche";

  const body = input.body ?? [];
  const bfTrend = trend(body, "body_fat");
  const mmTrend = trend(body, "muscle_mass");

  // Masse grasse en baisse marquée sans gain de muscle → sèche.
  if (bfTrend != null && bfTrend <= -1 && (mmTrend == null || mmTrend <= 0)) {
    return "seche";
  }
  // Masse musculaire en hausse → hypertrophie.
  if (mmTrend != null && mmTrend >= 0.5) return "hypertrophie";

  // Signal d'entraînement : plage de reps réellement utilisée.
  const avg = input.avgReps;
  if (avg != null && avg > 0) {
    if (avg <= 5) return "force";
    if (avg >= 15) return "endurance";
    if (avg <= 12) return "hypertrophie";
  }

  return "general";
}

export function buildProfileContext(input: ProfileInput): UserProfileContext {
  const body = input.body ?? [];
  const hasBodyData = body.length > 0;
  const objective = inferObjective(input);
  return {
    objective,
    explicit: !!input.explicitObjective,
    hasBodyData,
    latestWeight: hasBodyData ? firstNonNull(body, "weight") : null,
    latestBodyFat: hasBodyData ? firstNonNull(body, "body_fat") : null,
    latestMuscleMass: hasBodyData ? firstNonNull(body, "muscle_mass") : null,
    bodyFatTrend: hasBodyData ? trend(body, "body_fat") : null,
    muscleMassTrend: hasBodyData ? trend(body, "muscle_mass") : null,
  };
}
