// ============================================================
// « Tes cours » sur l'Accueil — les créneaux de cours de la semaine. PUR.
//
// Variante B choisie par Nathan (05/11/2026), « sans les muscles, en plus
// fin » : sous « Ton rythme », deux créneaux par semaine (le plafond serveur
// `workout_course` paie deux cours plein), remplis par les cours terminés de
// la semaine en cours (lundi → dimanche, dates locales).
//
// L'XP affichée sur un créneau rempli est CELLE DÉPOSÉE PAR LE SERVEUR sur la
// séance (`xp_after - xp_before`), jamais un montant calculé ici
// (INVARIANTS §3.1) ; tant qu'elle n'est pas arrivée, `xp` vaut `null`.
// ============================================================

import { courseOfMetadata } from "./courses";
import { DAY_NAMES, isoDayOf, weekDates } from "./weeklyPlan";

/** Créneaux montrés par semaine : deux cours sont payés plein (plafond 100 XP / 50 XP). */
export const COURSE_SLOTS_PER_WEEK = 2;

export interface CourseWeekWorkout {
  id: string;
  date: string;
  status: string;
  metadata?: unknown;
  created_at?: string | null;
  xp_before?: number | null;
  xp_after?: number | null;
}

export type CourseWeekSlot =
  | {
      kind: "done";
      workoutId: string;
      courseName: string;
      /** « Mer. » */
      dayShort: string;
      /** XP déposée par le serveur, `null` tant qu'elle n'est pas arrivée. */
      xp: number | null;
    }
  | { kind: "open" };

export interface CourseWeek {
  slots: CourseWeekSlot[];
  doneCount: number;
}

function serverXp(w: CourseWeekWorkout): number | null {
  if (typeof w.xp_before !== "number" || typeof w.xp_after !== "number") return null;
  return Math.max(0, w.xp_after - w.xp_before);
}

export function courseWeek(workouts: readonly CourseWeekWorkout[], today: string): CourseWeek {
  const days = new Set(weekDates(today));
  const done = workouts
    .filter((w) => w.status === "completed" && days.has(w.date))
    .map((w) => ({ w, course: courseOfMetadata(w.metadata) }))
    .filter((x): x is { w: CourseWeekWorkout; course: NonNullable<typeof x.course> } => !!x.course)
    .sort(
      (a, b) =>
        a.w.date.localeCompare(b.w.date) ||
        (a.w.created_at ?? "").localeCompare(b.w.created_at ?? ""),
    );

  const slots: CourseWeekSlot[] = done.map(({ w, course }) => ({
    kind: "done",
    workoutId: w.id,
    courseName: course.name,
    dayShort: `${DAY_NAMES[isoDayOf(w.date)].slice(0, 3)}.`,
    xp: serverXp(w),
  }));
  while (slots.length < COURSE_SLOTS_PER_WEEK) slots.push({ kind: "open" });
  return { slots, doneCount: done.length };
}
