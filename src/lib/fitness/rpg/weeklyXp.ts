/**
 * L'XP GAGNÉE CETTE SEMAINE — LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro couleur).
 *
 * La fiche de personnage de l'Accueil dit « Plus que 1 291 XP avant Éternel » ; à côté, un FAIT
 * donne le rythme : l'XP versée par le serveur cette semaine (ou la semaine dernière, tant que
 * celle-ci n'a encore rien rapporté). Jamais de projection (« Éternel dans 2 semaines ») : ce
 * serait une estimation présentée comme une mesure.
 *
 * La source est le journal `xp_events` (une ligne par versement), et NON les compteurs des
 * séances (`workouts.xp_before/xp_after`) : une montée de rang d'exercice verse son XP sans être
 * rattachée à une séance (mesure du 30/10/2026 : 200 XP sur 745 dans la semaine). Les semaines
 * sont locales et commencent le lundi, comme partout dans l'app (`weekStartOf`).
 */

import { addDaysYMD, localDateYMD } from "@/lib/dates";
import { weekStartOf } from "@/lib/fitness/weeklyReport";

export interface XpEventLike {
  amount: number | null;
  created_at: string;
}

export interface WeeklyXpSummary {
  /** XP versée depuis lundi (semaine en cours). */
  thisWeek: number;
  /** XP versée la semaine précédente (lundi → dimanche). */
  lastWeek: number;
}

/** Lundi (date locale) de la semaine PRÉCÉDENTE — début de la lecture nécessaire. */
export function previousWeekStart(todayDate: string): string {
  return addDaysYMD(weekStartOf(todayDate), -7);
}

export function summarizeWeeklyXp(
  events: readonly XpEventLike[],
  todayDate: string,
): WeeklyXpSummary {
  const thisMonday = weekStartOf(todayDate);
  const lastMonday = addDaysYMD(thisMonday, -7);
  const summary: WeeklyXpSummary = { thisWeek: 0, lastWeek: 0 };
  for (const event of events) {
    const amount = event.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    const at = new Date(event.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const day = localDateYMD(at);
    if (day > todayDate) continue;
    if (day >= thisMonday) summary.thisWeek += amount;
    else if (day >= lastMonday) summary.lastWeek += amount;
  }
  return summary;
}

export interface WeeklyXpLine {
  amount: number;
  /** « cette semaine » | « la semaine dernière ». */
  when: string;
}

/**
 * Ce que la fiche affiche : la semaine en cours dès qu'elle a rapporté quelque chose, sinon la
 * semaine dernière, sinon rien — jamais « +0 XP » (un lundi matin, ce serait un reproche).
 */
export function weeklyXpLine(summary: WeeklyXpSummary | null): WeeklyXpLine | null {
  if (!summary) return null;
  if (summary.thisWeek > 0) return { amount: summary.thisWeek, when: "cette semaine" };
  if (summary.lastWeek > 0) return { amount: summary.lastWeek, when: "la semaine dernière" };
  return null;
}
