/**
 * A01 — LA CARTE DU JOUR : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur), conformément
 * à `/src/lib`. On lui passe la semaine déjà dérivée (`buildWeekView`), la séance en
 * cours et l'historique ; elle renvoie CE QUE LA CARTE DIT et CE QUE SES BOUTONS FONT.
 * Le composant (`components/home/TodayCard.tsx`) ne décide de rien.
 *
 * ── Ce que la carte dit : des FAITS, jamais une estimation ──
 * Jamais de pourcentage de « récupération » ni de « forme » : une estimation présentée
 * comme une mesure fait perdre confiance à l'usage (décision de Nathan, 30/09/2026).
 * Chaque phrase affichée est lisible dans les données : le jour, la séance prévue et son
 * nombre de séries, ce qui a été fait la dernière fois, la prochaine séance prévue.
 *
 * ── Les six états, par ordre de priorité ──
 *   1. `active`  — une séance est en cours : elle prime sur tout le reste ;
 *   2. `done`    — une séance de musculation est terminée aujourd'hui ;
 *   3. `none`    — aucun plan du tout (ni repos, ni séance, sur aucun jour) ;
 *   4. `free`    — un plan existe, mais aujourd'hui n'y figure pas ;
 *   5. `rest`    — repos prévu aujourd'hui ;
 *   6. `planned` — un entraînement est prévu aujourd'hui, pas encore fait.
 * `loading` n'est pas un état du joueur : c'est « la séance sauvegardée du jour n'est
 * pas encore chargée » (voir `resolveTemplateRef`) — jamais confondu avec « supprimée ».
 *
 * ── « La dernière fois » ──
 * Rattachée à la séance sauvegardée du jour : la dernière séance de musculation
 * TERMINÉE qui porte le même nom, avec ses séries et son tonnage tels que
 * `buildSessionRecap` les compte (séries validées, jamais une saisie non cochée). Rien
 * n'est affiché si aucune séance du même nom n'existe, ou si elle n'a ni séries ni
 * tonnage : on n'invente pas de référence. Le même `lastSameNamedSession` servira
 * l'objectif de séance (C13).
 */

import { addDaysYMD } from "@/lib/dates";
import { buildSessionRecap } from "@/lib/fitness/rpg/sessionRecap";
import {
  DAY_NAMES,
  describeTemplateLoad,
  describePlanDay,
  isCountedWorkout,
  isoDayOf,
  type IsoDay,
  type PlanDay,
  type TemplateSummary,
  type WeekDayView,
  type WorkoutLike,
} from "@/lib/fitness/weeklyPlan";

// ── Entrées ─────────────────────────────────────────────────────────────

/** Le sous-ensemble d'une séance de l'historique. `WorkoutRow` (useWorkouts) s'y range tel quel. */
export interface TodayWorkout extends WorkoutLike {
  name: string;
  created_at?: string | null;
  exercises?: Parameters<typeof buildSessionRecap>[0] | null;
}

export interface TodayCardInput {
  /** Lundi → dimanche, de la semaine qui contient `todayDate` (`buildWeekView`). */
  week: readonly WeekDayView[];
  /** Aujourd'hui, date locale yyyy-MM-dd. */
  todayDate: string;
  /** `null` = modèles pas encore chargés — jamais « aucun modèle ». */
  templatesById: ReadonlyMap<string, TemplateSummary> | null;
  /** La séance de musculation en cours, s'il y en a une. */
  activeWorkout: { name: string; created_at: string } | null;
  workouts: readonly TodayWorkout[];
}

// ── Sorties ─────────────────────────────────────────────────────────────

/**
 * Ce que fait un bouton — décidé ICI, exécuté par le composant.
 * - `resume`         : retourner sur la séance en cours (écran Séances) ;
 * - `start-template` : démarrer la séance sauvegardée `templateId` ;
 * - `new-session`    : ouvrir « Choisir une épreuve » ;
 * - `edit-plan`      : ouvrir « Mon rythme ».
 */
export type TodayAction =
  | { type: "resume" }
  | { type: "start-template"; templateId: string }
  | { type: "new-session" }
  | { type: "edit-plan" };

export interface TodayButton {
  label: string;
  action: TodayAction;
}

export type TodayCardKind = "loading" | "active" | "done" | "none" | "free" | "rest" | "planned";

export interface TodayCardState {
  kind: TodayCardKind;
  /** Ligne d'en-tête, en capitales côté écran : « Jeudi 1 octobre · aujourd'hui ». */
  kicker: string;
  title: string;
  subtitle: string | null;
  /** « La dernière fois : 14 séries · 3 840 kg · il y a 8 jours » — `null` sans référence. */
  lastTime: string | null;
  primary: TodayButton | null;
  secondary: TodayButton | null;
}

// ── Dates ───────────────────────────────────────────────────────────────

/** Nombre de jours entre deux dates locales yyyy-MM-dd (arrondi : un changement d'heure fait 23 ou 25 h). */
export function daysBetweenYMD(fromYMD: string, toYMD: string): number {
  const from = new Date(`${fromYMD}T00:00:00`).getTime();
  const to = new Date(`${toYMD}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** « aujourd'hui », « hier », « il y a 8 jours ». Une date future est dite telle quelle (« demain », « dans 3 jours »). */
export function relativeDaysLabel(dateYMD: string, todayDate: string): string {
  const diff = daysBetweenYMD(dateYMD, todayDate);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff > 1) return `il y a ${diff} jours`;
  if (diff === -1) return "demain";
  return `dans ${-diff} jours`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleUpperCase("fr-FR") + text.slice(1);
}

/** « Jeudi 1 octobre » — la date longue d'un jour local. */
export function longDayLabel(dateYMD: string): string {
  const label = new Date(`${dateYMD}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return capitalize(label);
}

/** « 3 840 » — séparateur de milliers insécable, jamais d'arrondi caché. */
export function formatKg(kg: number): string {
  return Math.round(kg)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`;

// ── Références dans l'historique ────────────────────────────────────────

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("fr-FR");
}

/** Plus récente d'abord : la date, puis l'horodatage de création en départage. */
function newestFirst(a: TodayWorkout, b: TodayWorkout): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

export interface SessionReference {
  workoutId: string;
  name: string;
  date: string;
  /** Séries validées (voir `buildSessionRecap`). */
  sets: number;
  /** Tonnage en kg. 0 = aucune charge renseignée. */
  volumeKg: number;
}

function referenceOf(workout: TodayWorkout): SessionReference {
  const recap = buildSessionRecap(workout.exercises ?? []);
  return {
    workoutId: workout.id,
    name: workout.name,
    date: workout.date,
    sets: recap.totalSets,
    volumeKg: recap.totalVolumeKg,
  };
}

/**
 * La dernière séance de musculation TERMINÉE portant ce nom (casse et espaces
 * ignorés), antérieure à `beforeDate` si on la donne. `null` si aucune.
 * Une séance sans série ni tonnage n'est pas une référence : on passe à la
 * précédente plutôt que d'afficher « 0 série ».
 */
export function lastSameNamedSession(
  workouts: readonly TodayWorkout[],
  name: string,
  beforeDate?: string,
): SessionReference | null {
  const wanted = normalizeName(name);
  if (wanted === "") return null;
  const candidates = workouts
    .filter(
      (w) =>
        isCountedWorkout(w) &&
        normalizeName(w.name) === wanted &&
        (beforeDate === undefined || w.date < beforeDate),
    )
    .sort(newestFirst);
  for (const candidate of candidates) {
    const reference = referenceOf(candidate);
    if (reference.sets > 0 || reference.volumeKg > 0) return reference;
  }
  return null;
}

/** La dernière séance de musculation terminée, quel que soit son nom. */
export function lastCompletedSession(
  workouts: readonly TodayWorkout[],
): { name: string; date: string } | null {
  const [latest] = workouts.filter(isCountedWorkout).sort(newestFirst);
  return latest ? { name: latest.name, date: latest.date } : null;
}

/** « La dernière fois : 14 séries · 3 840 kg · il y a 8 jours » — jamais un chiffre à zéro. */
export function describeLastTime(reference: SessionReference, todayDate: string): string {
  const parts: string[] = [];
  if (reference.sets > 0) parts.push(plural(reference.sets, "série", "séries"));
  if (reference.volumeKg > 0) parts.push(`${formatKg(reference.volumeKg)} kg`);
  parts.push(relativeDaysLabel(reference.date, todayDate));
  return `La dernière fois : ${parts.join(" · ")}`;
}

// ── La prochaine séance prévue ──────────────────────────────────────────

export interface NextTraining {
  date: string;
  /** 1 = demain … 7 = même jour de la semaine prochaine. */
  daysFromToday: number;
  dayOfWeek: IsoDay;
  day: PlanDay;
}

/**
 * Le prochain jour d'ENTRAÎNEMENT prévu après aujourd'hui. Le plan est
 * récurrent : après dimanche, on repart sur lundi de la semaine suivante. Les
 * sept jours suivants couvrent donc toute la semaine, aujourd'hui compris dans
 * sa version de la semaine prochaine. `null` si le plan n'a aucun entraînement.
 */
export function nextTrainingAfter(
  week: readonly WeekDayView[],
  todayDate: string,
): NextTraining | null {
  const planByDay = new Map<IsoDay, PlanDay | null>(week.map((d) => [d.dayOfWeek, d.plan]));
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDaysYMD(todayDate, offset);
    const dayOfWeek = isoDayOf(date);
    const day = planByDay.get(dayOfWeek) ?? null;
    if (day !== null && day.kind !== "rest") {
      return { date, daysFromToday: offset, dayOfWeek, day };
    }
  }
  return null;
}

/** « demain », « samedi », « jeudi prochain » (même jour, une semaine plus tard). */
function whenLabel(next: NextTraining): string {
  if (next.daysFromToday === 1) return "demain";
  const name = DAY_NAMES[next.dayOfWeek].toLocaleLowerCase("fr-FR");
  return next.daysFromToday === 7 ? `${name} prochain` : name;
}

/** « Prochaine séance : demain · Dos + Pectoraux ». */
export function describeNextTraining(
  next: NextTraining,
  templatesById: ReadonlyMap<string, TemplateSummary> | null,
): string {
  const what = describePlanDay(next.day, templatesById).full;
  return `Prochaine séance : ${whenLabel(next)} · ${what}`;
}

// ── La carte ────────────────────────────────────────────────────────────

const EDIT_PLAN: TodayButton = { label: "Planifier ma semaine", action: { type: "edit-plan" } };
const NEW_SESSION: TodayButton = { label: "Choisir une épreuve", action: { type: "new-session" } };

/** « 18:42 » — l'heure locale de démarrage : un fait qui ne vieillit pas, sans minuteur à rafraîchir. */
function startedAtLabel(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function resolveTodayCard(input: TodayCardInput): TodayCardState {
  const { week, todayDate, templatesById, activeWorkout, workouts } = input;
  const dateLine = longDayLabel(todayDate);
  const kicker = `${dateLine} · aujourd'hui`;

  // 1. Une séance en cours prime sur tout le reste.
  if (activeWorkout) {
    const startedAt = startedAtLabel(activeWorkout.created_at);
    return {
      kind: "active",
      kicker: "Séance en cours",
      title: activeWorkout.name.trim() || "Ma séance",
      subtitle: startedAt ? `Démarrée à ${startedAt}` : null,
      lastTime: null,
      primary: { label: "Reprendre ma séance", action: { type: "resume" } },
      secondary: null,
    };
  }

  const today = week.find((d) => d.date === todayDate) ?? null;
  const hasPlan = week.some((d) => d.plan !== null);
  const next = hasPlan ? nextTrainingAfter(week, todayDate) : null;
  const nextLine = next ? describeNextTraining(next, templatesById) : null;

  // 2. Une séance est déjà faite aujourd'hui (plan ou non : sur un jour de repos, c'est un bonus).
  if (today && today.state === "done") {
    const sessions = today.workoutIds.length;
    return {
      kind: "done",
      kicker,
      title: "Séance faite",
      subtitle:
        nextLine ?? plural(sessions, "séance validée aujourd'hui", "séances validées aujourd'hui"),
      lastTime: null,
      primary: null,
      secondary: { label: "M'entraîner encore", action: { type: "new-session" } },
    };
  }

  // 3. Aucun plan du tout : une invitation, et un fait — la dernière séance.
  if (!hasPlan) {
    const last = lastCompletedSession(workouts);
    return {
      kind: "none",
      kicker,
      title: "Quoi faire aujourd'hui ?",
      subtitle: last
        ? `Dernière séance : « ${last.name.trim() || "Sans nom"} » · ${relativeDaysLabel(last.date, todayDate)}`
        : "Ta première séance t'attend.",
      lastTime: null,
      primary: NEW_SESSION,
      secondary: EDIT_PLAN,
    };
  }

  // 4. Un plan existe, mais pas pour aujourd'hui.
  if (!today || today.plan === null) {
    return {
      kind: "free",
      kicker,
      title: "Jour libre",
      subtitle: nextLine,
      lastTime: null,
      primary: NEW_SESSION,
      secondary: null,
    };
  }

  // 5. Repos : le bouton « s'entraîner quand même » est toujours là, mais secondaire.
  if (today.plan.kind === "rest") {
    return {
      kind: "rest",
      kicker,
      title: "Repos",
      subtitle: nextLine,
      lastTime: null,
      primary: null,
      secondary: { label: "M'entraîner quand même", action: { type: "new-session" } },
    };
  }

  // 6. Un entraînement est prévu.
  const description = describePlanDay(today.plan, templatesById);
  if (description.ref === "pending") {
    return {
      kind: "loading",
      kicker,
      title: "",
      subtitle: null,
      lastTime: null,
      primary: null,
      secondary: null,
    };
  }

  const planned = today.plan;
  const changeButton: TodayButton = { label: "Changer", action: { type: "edit-plan" } };

  if (planned.kind === "template" && description.ref === "ok" && planned.templateId !== null) {
    const summary = templatesById?.get(planned.templateId);
    const load = summary ? describeTemplateLoad(summary) : "";
    const reference = lastSameNamedSession(workouts, description.full, todayDate);
    return {
      kind: "planned",
      kicker,
      title: description.full,
      subtitle: load ? `Prévu dans ton rythme · ${load}` : "Prévu dans ton rythme",
      lastTime: reference ? describeLastTime(reference, todayDate) : null,
      primary: {
        label: "Démarrer la séance",
        action: { type: "start-template", templateId: planned.templateId },
      },
      secondary: changeButton,
    };
  }

  // Séance sauvegardée supprimée depuis : le jour reste un jour d'entraînement, on le dit.
  if (planned.kind === "template") {
    return {
      kind: "planned",
      kicker,
      title: description.full,
      subtitle: "Prévu dans ton rythme · cette séance sauvegardée n'existe plus",
      lastTime: null,
      primary: { label: "Choisir une épreuve", action: { type: "new-session" } },
      secondary: changeButton,
    };
  }

  // Simples groupes musculaires.
  return {
    kind: "planned",
    kicker,
    title: description.full,
    subtitle: "Prévu dans ton rythme",
    lastTime: null,
    primary: { label: "Démarrer la séance", action: { type: "new-session" } },
    secondary: changeButton,
  };
}
