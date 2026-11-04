// ============================================================
// Cours encadrés (Lagree aujourd'hui, HYROX chez Episod demain) — logique PURE.
//
// Zéro React, zéro Supabase, zéro couleur.
//
// Un cours n'est PAS un nouveau module : c'est un modèle de séance
// (`workout_templates.course_key`) qui démarre une séance « activité
// accompagnée » (`discipline = "guided"`) déjà remplie. La séance porte le
// cours dans `workouts.metadata.course` ; c'est cette clé que lit le trigger
// serveur `award_xp_on_workout_complete` pour verser l'XP de cours
// (`reward_catalog.workout_course`) — le MONTANT reste décidé par le serveur
// (INVARIANTS §3.1), jamais ici.
//
// Les zones sont des `MuscleId` (vocabulaire du moteur de récupération) : une
// INDICATION déclarative des zones travaillées par le cours, pas une mesure.
// Elles alimentent la carte de récupération, jamais le Rang par exercice.
// ============================================================

import { MUSCLE_META, type MuscleId } from "./muscleMapping";

export type CourseKey = "lagree";

export interface Course {
  key: CourseKey;
  /** Nom du modèle et de la séance. */
  name: string;
  /** Libellé d'activité du moteur « activité accompagnée » (historique). */
  activity: string;
  /** Matériel / format, affiché sous le nom. */
  format: string;
  /** Un cours a toujours la même durée : elle est enregistrée telle quelle. */
  durationMinutes: number;
  /** Salle habituelle. */
  location: string;
  /** Zones ciblées, dans l'ordre d'affichage. */
  zones: readonly MuscleId[];
  /** Estimation déclarée (même profil que le moteur guidé), jamais une mesure. */
  kcalPerMinute: number;
}

export const COURSES: Readonly<Record<CourseKey, Course>> = {
  lagree: {
    key: "lagree",
    name: "Lagree",
    activity: "Pilates Lagree",
    format: "Megaformer",
    durationMinutes: 50,
    location: "Keep Cool",
    zones: ["abdos", "obliques", "fessiers", "quadriceps", "ischio"],
    kcalPerMinute: 6,
  },
};

export function isCourseKey(value: unknown): value is CourseKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COURSES, value);
}

/** Le cours d'un modèle (`course_key`), ou `null` pour un modèle de musculation. */
export function courseOfTemplate(template: { course_key?: string | null }): Course | null {
  return isCourseKey(template.course_key) ? COURSES[template.course_key] : null;
}

/** Le cours d'une séance, lu dans `metadata.course`, ou `null`. */
export function courseOfMetadata(metadata: unknown): Course | null {
  if (!metadata || typeof metadata !== "object") return null;
  const key = (metadata as { course?: unknown }).course;
  return isCourseKey(key) ? COURSES[key] : null;
}

export function courseCaloriesEstimate(course: Course): number {
  return Math.round(course.kcalPerMinute * course.durationMinutes);
}

/**
 * Métadonnées d'une séance de cours — même forme que
 * `GuidedActivityEngine.toWorkoutRecord` (activity, intensité, calories,
 * récupération, segments) pour que l'historique « activité accompagnée »
 * l'affiche sans code de plus, augmentée de `course` et `muscleZones`.
 */
export function buildCourseMetadata(course: Course) {
  return {
    activity: course.activity,
    course: course.key,
    muscleZones: [...course.zones],
    intensityLabel: "Modérée à élevée",
    caloriesEstimate: courseCaloriesEstimate(course),
    recoveryHoursEstimate: 24,
    segments: [],
  };
}

/**
 * Zones travaillées enregistrées sur une séance (`metadata.muscleZones`), en
 * ignorant toute valeur qui n'est pas un `MuscleId` connu. Les zones sont lues
 * telles qu'enregistrées : modifier le catalogue ne réécrit pas le passé.
 */
export function muscleZonesOfMetadata(metadata: unknown): MuscleId[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { muscleZones?: unknown }).muscleZones;
  if (!Array.isArray(raw)) return [];
  const out: MuscleId[] = [];
  for (const z of raw) {
    if (typeof z === "string" && z in MUSCLE_META && !out.includes(z as MuscleId)) {
      out.push(z as MuscleId);
    }
  }
  return out;
}

/**
 * Forme de la séance démarrée depuis un modèle : un modèle de cours démarre
 * une « activité accompagnée » déjà remplie, un modèle de musculation une
 * séance de musculation vide de métadonnées (comportement inchangé).
 */
export function templateSessionShape(template: { course_key?: string | null }): {
  discipline: "muscu" | "guided";
  gymLocation: string;
  metadata: Record<string, unknown>;
} {
  const course = courseOfTemplate(template);
  if (!course) return { discipline: "muscu", gymLocation: "Salle inconnue", metadata: {} };
  return {
    discipline: "guided",
    gymLocation: course.location,
    metadata: buildCourseMetadata(course),
  };
}

/**
 * Durée enregistrée à la clôture d'une séance générique : un cours dure
 * toujours sa durée (Lagree : 50 min), jamais le temps écoulé à l'écran ;
 * sinon le temps écoulé, borné à [1, 600] (règle existante).
 */
export function genericFinishDurationMinutes(metadata: unknown, elapsedMs: number): number {
  const course = courseOfMetadata(metadata);
  if (course) return course.durationMinutes;
  return Math.min(600, Math.max(1, Math.round(elapsedMs / 60_000)));
}
