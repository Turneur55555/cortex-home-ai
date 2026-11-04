// ============================================================
// Cours de Lagree — enregistrement simple (date, durée, zones travaillées).
//
// Réutilise le modèle existant : une séance `workouts` discipline="guided"
// (moteur GuidedActivityEngine), activity="Pilates Lagree". Les zones
// sont des `MuscleId` stockées dans `metadata.muscleZones` — c'est une
// INDICATION déclarative des zones travaillées, jamais une mesure
// d'activation musculaire. Elles n'alimentent pas le moteur de Rang
// (feedsRankEngine=false reste étanche).
// ============================================================

import type { MuscleId } from "./muscleMapping";

export const LAGREE_ACTIVITY = "Pilates Lagree" as const;
export const LAGREE_DEFAULT_DURATION_MIN = 45;

/** Proposition par défaut : corps entier, accent gainage/abdos/fessiers/jambes/épaules/bras. */
export const LAGREE_DEFAULT_ZONES: readonly MuscleId[] = [
  "abdos",
  "obliques",
  "lombaires",
  "fessiers",
  "quadriceps",
  "ischio",
  "mollets",
  "epaules",
  "biceps",
  "triceps",
];

/** Zones proposées dans le sélecteur, dans un ordre lisible (haut → bas). */
export const LAGREE_SELECTABLE_ZONES: readonly MuscleId[] = [
  "epaules",
  "pectoraux",
  "dos",
  "trapeze",
  "biceps",
  "triceps",
  "avant-bras",
  "abdos",
  "obliques",
  "lombaires",
  "fessiers",
  "quadriceps",
  "ischio",
  "mollets",
];

const VALID = new Set<string>(LAGREE_SELECTABLE_ZONES);

/** Lit les zones depuis metadata, en ignorant toute valeur inconnue. */
export function readMuscleZones(metadata: unknown): MuscleId[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { muscleZones?: unknown }).muscleZones;
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((z): z is MuscleId => typeof z === "string" && VALID.has(z))));
}

export function isLagreeWorkout(w: { discipline?: string | null; metadata?: unknown }): boolean {
  if (w.discipline !== "guided") return false;
  const m = w.metadata as { activity?: unknown } | null | undefined;
  return m?.activity === LAGREE_ACTIVITY;
}

export function toggleZone(zones: readonly MuscleId[], id: MuscleId): MuscleId[] {
  return zones.includes(id) ? zones.filter((z) => z !== id) : [...zones, id];
}

/** Métadonnées de la séance — même forme que GuidedActivityEngine.toWorkoutRecord. */
export function buildLagreeMetadata(durationMin: number, zones: readonly MuscleId[]) {
  const kcalPerMinute = 6; // même profil que ACTIVITY_PROFILES["Pilates Lagree"]
  return {
    activity: LAGREE_ACTIVITY,
    intensityLabel: "Modérée à élevée",
    caloriesEstimate: Math.round(kcalPerMinute * durationMin),
    recoveryHoursEstimate: 24,
    muscleZones: [...new Set(zones)],
    segments: [],
  };
}
