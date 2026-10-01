/**
 * F26 — LE RAPPORT DE SEMAINE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur), conformément à
 * `/src/lib`. Le rapport d'une semaine est DÉRIVÉ, à la lecture, des séances terminées :
 * jamais stocké, jamais généré par une tâche planifiée, jamais écrit par une IA.
 *
 * ── Pourquoi dérivé, et pas généré ──
 * La maquette supposait qu'une fonction planifiée générait le contenu chaque lundi. En
 * production, c'est faux : `scheduled-weekly-report` ne crée que des lignes VIDES
 * (« generating ») et n'a jamais tourné — la table ne contient que 3 rapports, tous de
 * juin à début août. S'appuyer sur elle aurait livré un rapport qui n'arrive jamais. Une
 * dérivation locale est offline-first, immédiate, rétroactive (toute l'histoire a ses
 * semaines) et ne peut pas diverger des séances — exactement le principe du plan (B06).
 * Le système existant (`/rapports`, `weekly_reports`, `generate-weekly-report`) n'est pas
 * touché : c'est un autre produit (bilan IA avec nutrition et corps, à la demande).
 *
 * ── Des faits, jamais une estimation ──
 * Chaque chiffre se lit dans les séances. Aucune phrase générique, aucune félicitation
 * qui ne repose pas sur un fait. Une semaine sans séance n'a PAS de rapport : on ne
 * célèbre rien et on ne culpabilise pas.
 *
 * ── Les chiffres, comme ailleurs dans l'app ──
 * Séries et volume viennent de `buildSessionRecap` — les mêmes que la carte récap de fin
 * de séance et la Carte du jour. Les records viennent de `computeRecordsBySession` — les
 * mêmes que la Chronique de chaque séance : une séance affiche les mêmes records dans sa
 * Chronique et ici. Limite héritée, non introduite ici : l'historique chargé est borné
 * (les 60 séances les plus récentes), donc un record peut être surestimé si une charge
 * plus lourde existe au-delà.
 *
 * ── « X / Y prévues » : seulement quand c'est VÉRIFIABLE ──
 * Le plan (B06) est un état courant, pas un historique : il ne dit pas ce qui était prévu
 * une semaine passée. On ne compare donc à la semaine que si TOUTES les lignes du plan ont
 * été modifiées pour la dernière fois AVANT le début de cette semaine — le plan actuel est
 * alors, sans aucun doute, celui qui était en vigueur. Sinon : pas de « prévues ». Trou
 * connu : effacer un jour du plan supprime sa ligne, ce que rien ne trahit après coup.
 */

import { addDaysYMD, localDateYMD, localWeekStartYMD } from "@/lib/dates";
import { computeRecordsBySession, type SessionRecord } from "@/lib/fitness/chronicles";
import { buildSessionRecap } from "@/lib/fitness/rpg/sessionRecap";
import { plausibleDurationMinutes } from "@/lib/fitness/sessionDuration";
import { formatKg, type TodayWorkout } from "@/lib/fitness/todayCard";
import type { ExerciseLike } from "@/lib/fitness/workoutGrouping";
import {
  buildWeekView,
  isCountedWorkout,
  isoDayOf,
  resolveWeeklyPlan,
  type PlanDayRow,
} from "@/lib/fitness/weeklyPlan";

// ── Entrées ─────────────────────────────────────────────────────────────

/** Une séance de l'historique. `WorkoutRow` (useWorkouts) s'y range tel quel. */
export type ReportWorkout = TodayWorkout & {
  duration_minutes?: number | null;
  exercises?: ExerciseLike[] | null;
};

/** Une ligne du plan avec de quoi dater sa dernière modification. `weekly_plan_days` s'y range tel quel. */
export type ReportPlanRow = PlanDayRow;

export interface WeeklyReportInput {
  /** Lundi de la semaine voulue, yyyy-MM-dd (date locale). */
  weekStart: string;
  workouts: readonly ReportWorkout[];
  planRows: readonly ReportPlanRow[];
}

// ── Sorties ─────────────────────────────────────────────────────────────

export interface ReportRecord {
  key: string;
  name: string;
  weight: number;
  /** La charge battue ; toujours renseignée (un premier exercice n'est pas un record). */
  previousWeight: number | null;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  /** 1..53, semaine ISO. */
  weekNumber: number;
  /** « Semaine 39 · 21 → 27 septembre ». */
  label: string;
  /** « Ta meilleure semaine », « Ta meilleure semaine depuis juin », « Ta première semaine », « Ta semaine ». */
  headline: string;
  sessions: number;
  /** Jours d'entraînement prévus — `null` si la comparaison n'est pas vérifiable (voir l'en-tête). */
  plannedSessions: number | null;
  /** Parmi eux, ceux où une séance a été faite — `null` quand `plannedSessions` l'est. */
  plannedDone: number | null;
  sets: number;
  volumeKg: number;
  /** Somme des durées connues ; `null` si aucune durée n'est renseignée. */
  minutes: number | null;
  /** Le volume de la semaine précédente — `null` si elle n'a ni séance ni charge. */
  previousVolumeKg: number | null;
  /** Variation du volume sur la semaine précédente, en % entier — `null` sans comparaison possible. */
  volumeDeltaPercent: number | null;
  records: ReportRecord[];
  /** Une phrase fondée sur les faits ci-dessus — `null` quand il n'y a rien de vrai à en dire. */
  sentence: string | null;
}

/** Résumé d'une semaine, pour la liste des semaines passées. */
export interface WeeklyReportSummary {
  weekStart: string;
  label: string;
  sessions: number;
  volumeKg: number;
  recordCount: number;
}

export interface WeekReportTeaser {
  weekStart: string;
  title: string;
  /** « Semaine 39 · 5 séances, 3 records ». */
  subtitle: string;
}

// ── Dates ───────────────────────────────────────────────────────────────

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`;

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00`);

/** Lundi (date locale) de la semaine qui contient `dateYMD`. */
export function weekStartOf(dateYMD: string): string {
  return localWeekStartYMD(toDate(dateYMD));
}

/** Vrai si `value` est un lundi valide au format yyyy-MM-dd — la forme d'un identifiant de semaine. */
export function isWeekStart(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && localDateYMD(date) === value && date.getDay() === 1;
}

export function weekEndOf(weekStart: string): string {
  return addDaysYMD(weekStart, 6);
}

/** Numéro de semaine ISO 8601 du lundi donné. */
export function isoWeekNumber(weekStart: string): number {
  const monday = toDate(weekStart);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3); // le jeudi décide de l'année ISO
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const jan4Offset = (jan4.getDay() + 6) % 7; // lundi = 0
  const days = Math.round((thursday.getTime() - jan4.getTime()) / 86_400_000);
  return 1 + Math.floor((days + jan4Offset) / 7);
}

const dayMonth = (ymd: string, withMonth: boolean) =>
  toDate(ymd).toLocaleDateString(
    "fr-FR",
    withMonth ? { day: "numeric", month: "long" } : { day: "numeric" },
  );

/** « 21 → 27 septembre » ; à cheval sur deux mois : « 28 septembre → 4 octobre ». */
export function weekRangeLabel(weekStart: string): string {
  const end = weekEndOf(weekStart);
  const sameMonth = toDate(weekStart).getMonth() === toDate(end).getMonth();
  return `${dayMonth(weekStart, !sameMonth)} → ${dayMonth(end, true)}`;
}

export function weekLabel(weekStart: string): string {
  return `Semaine ${isoWeekNumber(weekStart)} · ${weekRangeLabel(weekStart)}`;
}

function monthWithYear(weekStart: string, referenceWeekStart: string): string {
  const date = toDate(weekStart);
  const month = date.toLocaleDateString("fr-FR", { month: "long" });
  return date.getFullYear() === toDate(referenceWeekStart).getFullYear()
    ? month
    : `${month} ${date.getFullYear()}`;
}

// ── Préparation de l'historique ─────────────────────────────────────────

interface WeekTotals {
  weekStart: string;
  workouts: ReportWorkout[];
  sets: number;
  volumeKg: number;
  minutes: number | null;
  /**
   * Une séance de la semaine porte une durée IMPLAUSIBLE (le plafond de 600 min d'une séance
   * restée ouverte, par exemple — `lib/fitness/sessionDuration.ts`). Le total serait alors faux de
   * plusieurs heures : on n'affiche pas de « Temps » plutôt qu'un « 30 h 40 » inventé.
   */
  hasUnknownDuration: boolean;
}

interface History {
  /** Séances comptées, groupées par semaine. */
  byWeek: Map<string, WeekTotals>;
  records: Map<string, SessionRecord[]>;
}

function prepareHistory(workouts: readonly ReportWorkout[]): History {
  const counted = workouts.filter(isCountedWorkout);
  const byWeek = new Map<string, WeekTotals>();
  for (const workout of counted) {
    const start = weekStartOf(workout.date);
    let week = byWeek.get(start);
    if (!week) {
      week = {
        weekStart: start,
        workouts: [],
        sets: 0,
        volumeKg: 0,
        minutes: null,
        hasUnknownDuration: false,
      };
      byWeek.set(start, week);
    }
    const recap = buildSessionRecap(workout.exercises ?? []);
    week.workouts.push(workout);
    week.sets += recap.totalSets;
    week.volumeKg += recap.totalVolumeKg;
    const minutes = workout.duration_minutes;
    if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
      if (plausibleDurationMinutes(minutes) === null) week.hasUnknownDuration = true;
      else week.minutes = (week.minutes ?? 0) + minutes;
    }
  }
  return { byWeek, records: computeRecordsBySession(counted) };
}

/** Records battus pendant la semaine (jamais « premier exercice »), un par exercice : la charge la plus lourde. */
function weekRecords(week: WeekTotals, records: Map<string, SessionRecord[]>): ReportRecord[] {
  const ordered = [...week.workouts].sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const best = new Map<string, ReportRecord>();
  for (const workout of ordered) {
    for (const record of records.get(workout.id) ?? []) {
      if (record.isNew) continue;
      const kept = best.get(record.key);
      if (!kept || record.weight > kept.weight) {
        best.set(record.key, {
          key: record.key,
          name: record.name,
          weight: record.weight,
          previousWeight: record.previousWeight,
        });
      }
    }
  }
  return [...best.values()];
}

// ── La comparaison au plan ──────────────────────────────────────────────

/**
 * Le plan actuel était-il, sans aucun doute, celui de cette semaine ? Oui seulement si
 * chaque ligne a été modifiée pour la dernière fois AVANT le lundi. Un horodatage
 * illisible n'est jamais « avant ».
 */
export function planWasInForce(planRows: readonly ReportPlanRow[], weekStart: string): boolean {
  if (planRows.length === 0) return false;
  return planRows.every((row) => {
    const modified = new Date(row.updated_at);
    return !Number.isNaN(modified.getTime()) && localDateYMD(modified) < weekStart;
  });
}

function planComparison(
  planRows: readonly ReportPlanRow[],
  workouts: readonly ReportWorkout[],
  weekStart: string,
): { planned: number; done: number } | null {
  if (!planWasInForce(planRows, weekStart)) return null;
  const plan = resolveWeeklyPlan(planRows);
  // La semaine est finie : « maintenant » est son dernier jour. `buildWeekView` en dérive les
  // jours d'entraînement et ceux où une séance a eu lieu ; tout état non « fait » est un jour
  // non tenu (dimanche inclus, que `buildWeekView` verrait encore comme « aujourd'hui »).
  const week = buildWeekView(plan, workouts, weekEndOf(weekStart));
  const planned = week.filter((day) => day.isTrainingPlanned);
  if (planned.length === 0) return null;
  return { planned: planned.length, done: planned.filter((day) => day.state === "done").length };
}

// ── Titre et phrase ─────────────────────────────────────────────────────

/** Combien de semaines séparent le « mieux que cette semaine » d'avant pour qu'il vaille d'être dit. */
const MIN_WEEKS_FOR_SINCE = 4;
/** En dessous, une hausse de volume n'est pas assez nette pour être dite. */
const MIN_VOLUME_RISE_PERCENT = 5;

function headlineFor(
  weekStart: string,
  volumeKg: number,
  earlier: ReadonlyArray<WeekTotals>,
): string {
  if (earlier.length === 0) return "Ta première semaine";
  if (volumeKg <= 0) return "Ta semaine";
  const best = Math.max(...earlier.map((week) => week.volumeKg));
  if (volumeKg > best) return "Ta meilleure semaine";
  // La plus récente semaine d'avant qui faisait au moins aussi bien.
  const betterBefore = [...earlier]
    .filter((week) => week.volumeKg >= volumeKg)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  if (!betterBefore) return "Ta semaine";
  const weeksAgo = Math.round(
    (toDate(weekStart).getTime() - toDate(betterBefore.weekStart).getTime()) / (7 * 86_400_000),
  );
  return weeksAgo >= MIN_WEEKS_FOR_SINCE
    ? `Ta meilleure semaine depuis ${monthWithYear(betterBefore.weekStart, weekStart)}`
    : "Ta semaine";
}

function sentenceFor(report: {
  plannedSessions: number | null;
  plannedDone: number | null;
  records: readonly ReportRecord[];
  volumeDeltaPercent: number | null;
}): string | null {
  const rhythmKept =
    report.plannedSessions !== null &&
    report.plannedDone !== null &&
    report.plannedDone >= report.plannedSessions;
  const records = report.records.length;
  const recordsText = `${plural(records, "record battu", "records battus")}`;

  if (rhythmKept && records > 0) {
    return `Rythme tenu : ${report.plannedDone} séances sur ${report.plannedSessions}, et ${recordsText}.`;
  }
  if (rhythmKept) {
    return `Rythme tenu : ${report.plannedDone} séances sur ${report.plannedSessions}.`;
  }
  if (records > 0)
    return `${recordsText[0].toLocaleUpperCase("fr-FR")}${recordsText.slice(1)} cette semaine.`;
  if (report.volumeDeltaPercent !== null && report.volumeDeltaPercent >= MIN_VOLUME_RISE_PERCENT) {
    return `Ton volume progresse de ${report.volumeDeltaPercent} % sur la semaine précédente.`;
  }
  return null;
}

// ── Le rapport ──────────────────────────────────────────────────────────

function reportFrom(
  history: History,
  weekStart: string,
  workouts: readonly ReportWorkout[],
  planRows: readonly ReportPlanRow[],
): WeeklyReport | null {
  const week = history.byWeek.get(weekStart);
  if (!week) return null; // une semaine sans séance n'a pas de rapport

  const previous = history.byWeek.get(addDaysYMD(weekStart, -7));
  const previousVolumeKg = previous && previous.volumeKg > 0 ? previous.volumeKg : null;
  const volumeDeltaPercent =
    previousVolumeKg !== null && week.volumeKg > 0
      ? Math.round(((week.volumeKg - previousVolumeKg) / previousVolumeKg) * 100)
      : null;

  const comparison = planComparison(planRows, workouts, weekStart);
  const records = weekRecords(week, history.records);
  const earlier = [...history.byWeek.values()].filter((w) => w.weekStart < weekStart);

  const base = {
    plannedSessions: comparison?.planned ?? null,
    plannedDone: comparison?.done ?? null,
    records,
    volumeDeltaPercent,
  };

  return {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    weekNumber: isoWeekNumber(weekStart),
    label: weekLabel(weekStart),
    headline: headlineFor(weekStart, week.volumeKg, earlier),
    sessions: week.workouts.length,
    ...base,
    sets: week.sets,
    volumeKg: week.volumeKg,
    minutes: week.hasUnknownDuration ? null : week.minutes,
    previousVolumeKg,
    sentence: sentenceFor(base),
  };
}

/** Le rapport d'une semaine, ou `null` si elle ne compte aucune séance terminée. */
export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport | null {
  return reportFrom(
    prepareHistory(input.workouts),
    input.weekStart,
    input.workouts,
    input.planRows,
  );
}

/**
 * Les semaines passées qui ont un rapport, de la plus récente à la plus ancienne. La semaine
 * EN COURS n'en fait pas partie : un bilan se lit quand la semaine est finie.
 */
export function listWeeklyReports(input: {
  workouts: readonly ReportWorkout[];
  planRows: readonly ReportPlanRow[];
  todayDate: string;
}): WeeklyReportSummary[] {
  const history = prepareHistory(input.workouts);
  const current = weekStartOf(input.todayDate);
  return [...history.byWeek.keys()]
    .filter((weekStart) => weekStart < current)
    .sort((a, b) => b.localeCompare(a))
    .map((weekStart) => reportFrom(history, weekStart, input.workouts, input.planRows))
    .filter((report): report is WeeklyReport => report !== null)
    .map((report) => ({
      weekStart: report.weekStart,
      label: report.label,
      sessions: report.sessions,
      volumeKg: report.volumeKg,
      recordCount: report.records.length,
    }));
}

/**
 * Le bandeau « Ta semaine est prête » de l'Accueil : le lundi et le mardi (48 h), si la semaine
 * qui vient de finir compte au moins une séance. Sinon rien : ni célébration, ni reproche.
 */
export function weekReportTeaser(input: {
  workouts: readonly ReportWorkout[];
  planRows: readonly ReportPlanRow[];
  todayDate: string;
}): WeekReportTeaser | null {
  const weekday = isoDayOf(input.todayDate);
  if (weekday !== 1 && weekday !== 2) return null;
  const previousWeekStart = addDaysYMD(weekStartOf(input.todayDate), -7);
  const report = buildWeeklyReport({
    weekStart: previousWeekStart,
    workouts: input.workouts,
    planRows: input.planRows,
  });
  if (report === null) return null;
  const parts = [plural(report.sessions, "séance", "séances")];
  if (report.records.length > 0) parts.push(plural(report.records.length, "record", "records"));
  return {
    weekStart: previousWeekStart,
    title: "Ta semaine est prête",
    subtitle: `Semaine ${report.weekNumber} · ${parts.join(", ")}`,
  };
}

/** « 18 420 kg » — pour l'affichage du volume. */
export const describeVolume = (volumeKg: number): string => `${formatKg(volumeKg)} kg`;

/** « 4 h 10 » ; moins d'une heure : « 45 min ». */
export function describeMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
