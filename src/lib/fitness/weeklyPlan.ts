// ============================================================
// B06 « Mon rythme » — le plan de la semaine (domaine pur).
//
// Zéro React, zéro Supabase, zéro IndexedDB, zéro couleur.
//
// Un plan est RÉCURRENT : pour chaque jour de la semaine ISO (1 = lundi
// … 7 = dimanche), le joueur a prévu repos, des groupes musculaires, ou
// une de ses séances sauvegardées. On STOCKE l'intention (table
// `weekly_plan_days`, au plus 7 lignes par utilisateur) ; on ne stocke
// JAMAIS l'état fait / à faire. Il se dérive ici, à la lecture, des
// séances réellement terminées de la semaine en cours : rien à
// réconcilier, rien qui puisse diverger de ce qui s'est passé.
//
// Règle de validation d'un jour (décision de Nathan, 30/09/2026) :
// n'importe quelle séance de MUSCULATION terminée ce jour-là. Pas de
// « séance touchant le bon groupe » — elle créerait des jours à moitié
// validés, impossibles à expliquer.
// ============================================================

import { addDaysYMD, localDateYMD, localWeekStartYMD } from "@/lib/dates";

// ── Vocabulaire ─────────────────────────────────────────────────────────

/**
 * Les 6 familles du plan. Ce sont EXACTEMENT les `id` de
 * `SPECIALIZATION_GROUPS` (chronicles.ts) — jamais un second vocabulaire de
 * muscles — et la liste autorisée par le CHECK de la migration
 * `20260930120000_weekly_plan_days.sql`. Le test `weeklyPlan.test.ts`
 * verrouille ces trois endroits ensemble : en ajouter une famille ici sans
 * migration ferait refuser l'écriture en base (opération `blocked`).
 */
export const PLAN_GROUP_IDS = ["dos", "pecs", "epaules", "bras", "jambes", "tronc"] as const;
export type PlanGroupId = (typeof PLAN_GROUP_IDS)[number];

export const PLAN_GROUP_LABELS: Record<PlanGroupId, string> = {
  dos: "Dos",
  pecs: "Pectoraux",
  epaules: "Épaules",
  bras: "Bras",
  jambes: "Jambes",
  tronc: "Tronc",
};

/** Libellés courts pour la bande de la semaine, où chaque jour tient dans ~45 px. */
export const PLAN_GROUP_SHORT_LABELS: Record<PlanGroupId, string> = {
  dos: "Dos",
  pecs: "Pecs",
  epaules: "Épaules",
  bras: "Bras",
  jambes: "Jambes",
  tronc: "Tronc",
};

export type IsoDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ISO_DAYS: readonly IsoDay[] = [1, 2, 3, 4, 5, 6, 7];

export const DAY_NAMES: Record<IsoDay, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

export const DAY_INITIALS: Record<IsoDay, string> = {
  1: "L",
  2: "M",
  3: "M",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

export type PlanDayKind = "rest" | "muscles" | "template";

// ── Forme stockée, forme lue ────────────────────────────────────────────

/**
 * Le sous-ensemble d'une ligne `weekly_plan_days` dont ce module a besoin.
 * Structurel : la ligne complète du repository offline (avec `user_id`,
 * `created_at`) s'y range sans conversion.
 */
export interface PlanDayRow {
  id: string;
  day_of_week: number;
  kind: string;
  muscle_groups: string[] | null;
  template_id: string | null;
  updated_at: string;
}

/**
 * Un jour planifié, tel que l'app le manipule. `templateId: null` n'est PAS
 * une erreur : c'est une séance sauvegardée qui a été supprimée depuis
 * (`ON DELETE SET NULL`). Le jour reste un jour d'entraînement prévu — on le
 * présente comme « séance supprimée », on ne l'efface pas en silence.
 */
export type PlanDay =
  | { dayOfWeek: IsoDay; kind: "rest" }
  | { dayOfWeek: IsoDay; kind: "muscles"; groups: PlanGroupId[] }
  | { dayOfWeek: IsoDay; kind: "template"; templateId: string | null };

/** Un jour sans plan vaut `null` : ni repos, ni séance — simplement libre. */
export type WeeklyPlan = Record<IsoDay, PlanDay | null>;

export function emptyWeeklyPlan(): WeeklyPlan {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
}

function isIsoDay(value: unknown): value is IsoDay {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function isPlanGroupId(value: unknown): value is PlanGroupId {
  return typeof value === "string" && (PLAN_GROUP_IDS as readonly string[]).includes(value);
}

/**
 * Familles valides, dédoublonnées, dans l'ordre canonique. L'ordre canonique
 * rend deux saisies équivalentes (« dos, pecs » et « pecs, dos ») égales, donc
 * la détection « rien n'a changé » fiable.
 */
export function normalizeGroups(groups: readonly unknown[] | null | undefined): PlanGroupId[] {
  const wanted = new Set((groups ?? []).filter(isPlanGroupId));
  return PLAN_GROUP_IDS.filter((id) => wanted.has(id));
}

function timestampOf(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Plus récent d'abord ; à égalité, l'`id` le plus grand — déterministe, jamais « au hasard ». */
function byMostRecent(a: PlanDayRow, b: PlanDayRow): number {
  const delta = timestampOf(b.updated_at) - timestampOf(a.updated_at);
  if (delta !== 0) return delta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function parseRow(row: PlanDayRow): PlanDay | null {
  if (!isIsoDay(row.day_of_week)) return null;
  const dayOfWeek = row.day_of_week;
  if (row.kind === "rest") return { dayOfWeek, kind: "rest" };
  if (row.kind === "muscles") {
    const groups = normalizeGroups(row.muscle_groups);
    // Un jour « muscles » sans aucune famille valide serait un repos déguisé :
    // la base l'interdit (CHECK), on ne l'invente pas non plus à la lecture.
    return groups.length > 0 ? { dayOfWeek, kind: "muscles", groups } : null;
  }
  if (row.kind === "template") {
    return { dayOfWeek, kind: "template", templateId: row.template_id ?? null };
  }
  return null;
}

/**
 * Lignes stockées → plan de la semaine.
 *
 * Aucune contrainte UNIQUE ne protège (user_id, jour) en base — volontairement
 * (voir la migration) : deux appareils peuvent créer le même jour hors ligne.
 * C'est ICI que le doublon se départage : parmi les lignes VALIDES d'un jour,
 * la plus récemment modifiée gagne. Une ligne invalide, même plus récente, ne
 * masque donc jamais une ligne valide plus ancienne.
 */
export function resolveWeeklyPlan(rows: readonly PlanDayRow[]): WeeklyPlan {
  const plan = emptyWeeklyPlan();
  const best = new Map<IsoDay, { row: PlanDayRow; day: PlanDay }>();
  for (const row of rows) {
    const day = parseRow(row);
    if (!day) continue;
    const current = best.get(day.dayOfWeek);
    if (!current || byMostRecent(row, current.row) < 0) best.set(day.dayOfWeek, { row, day });
  }
  for (const [dayOfWeek, { day }] of best) plan[dayOfWeek] = day;
  return plan;
}

// ── Écriture ────────────────────────────────────────────────────────────

/** Ce que le joueur choisit pour un jour, avant validation. */
export type PlanDayInput =
  | { kind: "rest" }
  | { kind: "muscles"; groups: readonly string[] }
  | { kind: "template"; templateId: string };

/**
 * Le contenu complet à écrire en base. Les TROIS champs sont toujours
 * présents, y compris à `[]` / `null` : passer de « séance sauvegardée » à
 * « repos » doit effacer `template_id` DANS LE MÊME PATCH que le changement de
 * `kind`. Un patch partiel laisserait un repos portant un `template_id`, que le
 * CHECK `weekly_plan_days_template_only_check` refuserait — soit une opération
 * `blocked`, donc le point d'attention du Profil, pour un simple changement de
 * planning.
 */
export interface PlanRowContent {
  kind: PlanDayKind;
  muscle_groups: PlanGroupId[];
  template_id: string | null;
}

export type NormalizedPlanInput =
  | { ok: true; content: PlanRowContent }
  | { ok: false; reason: "no-groups" | "no-template" };

export function normalizePlanInput(input: PlanDayInput): NormalizedPlanInput {
  if (input.kind === "rest") {
    return { ok: true, content: { kind: "rest", muscle_groups: [], template_id: null } };
  }
  if (input.kind === "muscles") {
    const groups = normalizeGroups(input.groups);
    if (groups.length === 0) return { ok: false, reason: "no-groups" };
    return { ok: true, content: { kind: "muscles", muscle_groups: groups, template_id: null } };
  }
  const templateId = input.templateId.trim();
  if (templateId === "") return { ok: false, reason: "no-template" };
  return { ok: true, content: { kind: "template", muscle_groups: [], template_id: templateId } };
}

/**
 * Le contenu d'une ligne stockée, ou `null` si elle est illisible (`kind`
 * inconnu).
 *
 * ⚠️ Jamais « repos par défaut » : ramener une ligne illisible à un repos ferait
 * dire « inchangé » à `planDayWrite` quand le joueur choisit justement
 * « Repos » pour ce jour — rien ne serait écrit, la ligne resterait illisible
 * (donc ignorée par `resolveWeeklyPlan`) et le jour resterait invisible pour
 * toujours. Une ligne illisible doit toujours être réécrite.
 */
function contentOf(row: PlanDayRow): PlanRowContent | null {
  if (row.kind !== "rest" && row.kind !== "muscles" && row.kind !== "template") return null;
  return {
    kind: row.kind,
    muscle_groups: row.kind === "muscles" ? normalizeGroups(row.muscle_groups) : [],
    template_id: row.kind === "template" ? (row.template_id ?? null) : null,
  };
}

function sameContent(a: PlanRowContent, b: PlanRowContent): boolean {
  return (
    a.kind === b.kind &&
    a.template_id === b.template_id &&
    a.muscle_groups.length === b.muscle_groups.length &&
    a.muscle_groups.every((group, index) => group === b.muscle_groups[index])
  );
}

export type PlanWriteOp =
  | { type: "create"; content: PlanRowContent }
  | {
      type: "update";
      id: string;
      content: PlanRowContent;
      /** Vrai si la ligne a déjà exactement ce contenu : inutile d'émettre une opération de sync. */
      unchanged: boolean;
      /** Doublons du même jour à supprimer (voir `resolveWeeklyPlan`). */
      removeIds: string[];
    }
  | { type: "clear"; removeIds: string[] }
  | { type: "noop" };

/**
 * Décide QUOI écrire pour un jour. L'écriture met à jour la ligne existante
 * d'un jour plutôt que d'en créer une seconde : le doublon reste exceptionnel,
 * et quand il existe quand même, il est nettoyé au passage.
 *
 * `input = null` efface le jour (il redevient « libre »).
 */
export function planDayWrite(
  rows: readonly PlanDayRow[],
  dayOfWeek: IsoDay,
  input: NormalizedPlanInput | null,
): PlanWriteOp {
  const forDay = rows.filter((row) => row.day_of_week === dayOfWeek).sort(byMostRecent);

  if (input === null) {
    return forDay.length === 0
      ? { type: "noop" }
      : { type: "clear", removeIds: forDay.map((r) => r.id) };
  }
  if (!input.ok) return { type: "noop" };

  const [winner, ...duplicates] = forDay;
  if (!winner) return { type: "create", content: input.content };

  const current = contentOf(winner);
  return {
    type: "update",
    id: winner.id,
    content: input.content,
    unchanged: current !== null && sameContent(current, input.content),
    removeIds: duplicates.map((row) => row.id),
  };
}

// ── Lecture : la semaine en cours ───────────────────────────────────────

/** Le sous-ensemble d'une séance dont on a besoin. `WorkoutRow` s'y range tel quel. */
export interface WorkoutLike {
  id: string;
  /** yyyy-MM-dd, date LOCALE (jamais UTC — cf. lib/dates.ts). */
  date: string;
  status: string;
  discipline?: string | null;
}

/**
 * Une séance compte pour le plan si elle est TERMINÉE et de musculation. Une
 * séance active n'est pas « faite » ; une séance d'une autre discipline
 * (course, HYROX…) ne valide pas un jour de plan — les blocs cardio d'une
 * séance hybride vivent DANS une séance de musculation, qui, elle, compte.
 */
export function isCountedWorkout(workout: WorkoutLike): boolean {
  return workout.status === "completed" && (workout.discipline ?? "muscu") === "muscu";
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function assertYmd(value: string): void {
  if (!YMD.test(value)) throw new Error(`Date invalide « ${value} » : yyyy-MM-dd attendu`);
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date locale yyyy-MM-dd. */
export function isoDayOf(dateYMD: string): IsoDay {
  assertYmd(dateYMD);
  const jsDay = new Date(`${dateYMD}T00:00:00`).getDay(); // 0 = dimanche
  return (jsDay === 0 ? 7 : jsDay) as IsoDay;
}

/** Les 7 dates (lundi → dimanche) de la semaine qui contient `todayYMD`. */
export function weekDates(todayDate: string): string[] {
  assertYmd(todayDate);
  const monday = localWeekStartYMD(new Date(`${todayDate}T00:00:00`));
  return ISO_DAYS.map((_, index) => addDaysYMD(monday, index));
}

/** Aujourd'hui, en date locale — le défaut des appelants, isolé pour pouvoir être injecté en test. */
export function todayYMD(now: Date = new Date()): string {
  return localDateYMD(now);
}

/**
 * - `done`      — au moins une séance de musculation terminée ce jour-là ;
 * - `today`     — aujourd'hui, un entraînement est prévu et pas encore fait ;
 * - `upcoming`  — un entraînement est prévu, plus tard dans la semaine ;
 * - `missed`    — un entraînement était prévu, la date est passée, rien de fait ;
 * - `rest`      — repos prévu (et aucune séance ce jour-là) ;
 * - `unplanned` — aucun plan pour ce jour, aucune séance.
 */
export type DayState = "done" | "today" | "upcoming" | "missed" | "rest" | "unplanned";

export interface WeekDayView {
  dayOfWeek: IsoDay;
  date: string;
  plan: PlanDay | null;
  state: DayState;
  isToday: boolean;
  /** Un entraînement est prévu ce jour-là (plan ≠ repos et ≠ libre). Indépendant de `state`. */
  isTrainingPlanned: boolean;
  workoutIds: string[];
}

export function buildWeekView(
  plan: WeeklyPlan,
  workouts: readonly WorkoutLike[],
  todayDate: string,
): WeekDayView[] {
  const dates = weekDates(todayDate);
  const idsByDate = new Map<string, string[]>();
  for (const workout of workouts) {
    if (!isCountedWorkout(workout)) continue;
    const list = idsByDate.get(workout.date);
    if (list) list.push(workout.id);
    else idsByDate.set(workout.date, [workout.id]);
  }

  return ISO_DAYS.map((dayOfWeek, index): WeekDayView => {
    const date = dates[index];
    const dayPlan = plan[dayOfWeek];
    const workoutIds = idsByDate.get(date) ?? [];
    const isTrainingPlanned = dayPlan !== null && dayPlan.kind !== "rest";
    const isToday = date === todayDate;

    let state: DayState;
    if (workoutIds.length > 0) state = "done";
    else if (dayPlan === null) state = "unplanned";
    else if (dayPlan.kind === "rest") state = "rest";
    else if (date < todayDate) state = "missed";
    else if (isToday) state = "today";
    else state = "upcoming";

    return { dayOfWeek, date, plan: dayPlan, state, isToday, isTrainingPlanned, workoutIds };
  });
}

export interface WeekSummary {
  /** Jours d'entraînement prévus cette semaine. */
  plannedDays: number;
  /** Parmi eux, ceux où une séance a été faite. */
  doneDays: number;
  /** Jours d'entraînement prévus restant à faire (aujourd'hui compris). */
  remainingDays: number;
  /** Jours d'entraînement prévus passés sans séance. */
  missedDays: number;
  /** Séances faites un jour de repos ou un jour sans plan : un bonus, jamais un manque. */
  extraDays: number;
}

export function summarizeWeek(week: readonly WeekDayView[]): WeekSummary {
  const summary: WeekSummary = {
    plannedDays: 0,
    doneDays: 0,
    remainingDays: 0,
    missedDays: 0,
    extraDays: 0,
  };
  for (const day of week) {
    if (day.isTrainingPlanned) summary.plannedDays += 1;
    if (day.state === "done") {
      if (day.isTrainingPlanned) summary.doneDays += 1;
      else summary.extraDays += 1;
    } else if (day.state === "today" || day.state === "upcoming") {
      summary.remainingDays += 1;
    } else if (day.state === "missed") {
      summary.missedDays += 1;
    }
  }
  return summary;
}

// ── Séances sauvegardées : le nombre de séries ──────────────────────────

/** Le sous-ensemble d'un modèle dont on a besoin. `WorkoutTemplateRow` s'y range tel quel. */
export interface TemplateLike {
  id: string;
  name: string;
  exercises: readonly { default_sets: number | null }[];
  segments?: readonly unknown[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  exerciseCount: number;
  /** Blocs métriques (course, HYROX…) d'un modèle hybride — ce ne sont pas des séries. */
  blockCount: number;
  /** Somme des séries connues. */
  sets: number;
  /**
   * Vrai seulement si CHAQUE exercice porte un nombre de séries. Sinon `sets`
   * est un minimum, et l'écran ne doit pas le présenter comme le total : on
   * n'affiche jamais un chiffre plus précis que ce qu'on sait.
   */
  setsComplete: boolean;
}

export function summarizeTemplate(template: TemplateLike): TemplateSummary {
  let sets = 0;
  let known = 0;
  for (const exercise of template.exercises) {
    const value = exercise.default_sets;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      sets += Math.floor(value);
      known += 1;
    }
  }
  return {
    id: template.id,
    name: template.name,
    exerciseCount: template.exercises.length,
    blockCount: template.segments?.length ?? 0,
    sets,
    setsComplete: template.exercises.length > 0 && known === template.exercises.length,
  };
}

export type TemplateRefState = "ok" | "deleted" | "pending";

/**
 * Où en est la séance sauvegardée d'un jour « template » ?
 * - `deleted` : le modèle n'existe plus (`template_id` NULL après suppression,
 *   ou identifiant introuvable) ;
 * - `pending` : les modèles ne sont pas encore chargés — `templatesById` vaut
 *   `null`. Sans ce cas, un chargement lent ferait afficher « séance
 *   supprimée » à tort pendant une demi-seconde, sur chaque ouverture.
 */
export function resolveTemplateRef(
  day: PlanDay,
  templatesById: ReadonlyMap<string, TemplateSummary> | null,
): TemplateRefState {
  if (day.kind !== "template") return "ok";
  if (day.templateId === null) return "deleted";
  if (templatesById === null) return "pending";
  return templatesById.has(day.templateId) ? "ok" : "deleted";
}

export interface PlannedLoad {
  /** Séries des jours dont le nombre est connu avec certitude. */
  sets: number;
  /** Jours d'entraînement dont les séries sont comptées dans `sets`. */
  countedDays: number;
  /** Jours d'entraînement dont on ne connaît PAS le nombre de séries (groupes seuls, séance supprimée, séries incomplètes). */
  uncountedDays: number;
  /** Vrai si `sets` couvre TOUS les jours d'entraînement — seul cas où « N séries prévues » est exact. */
  complete: boolean;
}

export function plannedWeeklyLoad(
  plan: WeeklyPlan,
  templatesById: ReadonlyMap<string, TemplateSummary>,
): PlannedLoad {
  const load: PlannedLoad = { sets: 0, countedDays: 0, uncountedDays: 0, complete: true };
  for (const dayOfWeek of ISO_DAYS) {
    const day = plan[dayOfWeek];
    if (day === null || day.kind === "rest") continue;
    const summary =
      day.kind === "template" && day.templateId !== null
        ? templatesById.get(day.templateId)
        : undefined;
    if (summary && summary.setsComplete) {
      load.sets += summary.sets;
      load.countedDays += 1;
    } else {
      load.uncountedDays += 1;
    }
  }
  load.complete = load.uncountedDays === 0;
  return load;
}

// ── Libellés ────────────────────────────────────────────────────────────

/** « 16 séries · 5 exos », « 12+ séries · 4 exos », « 2 blocs » — jamais un chiffre inventé. */
export function describeTemplateLoad(summary: TemplateSummary): string {
  const parts: string[] = [];
  if (summary.sets > 0) {
    parts.push(
      `${summary.sets}${summary.setsComplete ? "" : "+"} série${summary.sets > 1 ? "s" : ""}`,
    );
  }
  if (summary.exerciseCount > 0) {
    parts.push(`${summary.exerciseCount} exo${summary.exerciseCount > 1 ? "s" : ""}`);
  }
  if (summary.blockCount > 0) {
    parts.push(`${summary.blockCount} bloc${summary.blockCount > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

/**
 * La phrase de synthèse du plan : « 5 séances par semaine · 68 séries prévues ».
 *
 * Le total de séries n'est annoncé comme « prévu » que s'il couvre TOUS les
 * jours d'entraînement (`load.complete`). Dès qu'un jour est de simples groupes
 * musculaires, ou une séance aux séries incomplètes, on dit « au moins » : ne
 * jamais présenter un minimum comme un total.
 */
export function describePlannedWeek(plannedDays: number, load: PlannedLoad): string {
  if (plannedDays === 0) return "Aucune séance prévue — choisis tes jours.";
  const sessions = `${plannedDays} séance${plannedDays > 1 ? "s" : ""} par semaine`;
  if (load.countedDays === 0) return sessions;
  const sets = `${load.sets} série${load.sets > 1 ? "s" : ""}`;
  if (load.complete) return `${sessions} · ${sets} prévue${load.sets > 1 ? "s" : ""}`;
  return `${sessions} · au moins ${sets}`;
}

export interface PlanDayDescription {
  /** Pour la bande de la semaine (~45 px de large). */
  short: string;
  /** Pour la liste de réglage et les lecteurs d'écran. */
  full: string;
  /** Le détail secondaire (« 16 séries · 5 exos ») — seulement pour une séance sauvegardée connue. */
  detail: string | null;
  /** Où en est la séance sauvegardée du jour (« ok » pour tout autre type de jour). */
  ref: TemplateRefState;
}

/**
 * Tout ce qu'il faut pour AFFICHER un jour, en un seul endroit : la bande, la
 * liste et le message vocal passent par ici, pour ne jamais se contredire.
 *
 * `templatesById = null` signifie « modèles pas encore chargés » : une séance
 * sauvegardée s'affiche alors « … », jamais « supprimée » (voir
 * `resolveTemplateRef`).
 */
export function describePlanDay(
  day: PlanDay | null,
  templatesById: ReadonlyMap<string, TemplateSummary> | null,
): PlanDayDescription {
  if (day === null || day.kind !== "template") {
    return {
      short: planDayShortLabel(day),
      full: planDayLabel(day),
      detail: null,
      ref: "ok",
    };
  }
  const ref = resolveTemplateRef(day, templatesById);
  if (ref === "pending") return { short: "…", full: "…", detail: null, ref };
  if (ref === "deleted" || day.templateId === null) {
    return {
      short: planDayShortLabel(day),
      full: planDayLabel(day),
      detail: null,
      ref: "deleted",
    };
  }
  const summary = templatesById?.get(day.templateId);
  if (!summary) {
    return { short: planDayShortLabel(day), full: planDayLabel(day), detail: null, ref: "deleted" };
  }
  return {
    short: planDayShortLabel(day, summary.name),
    full: planDayLabel(day, summary.name),
    detail: describeTemplateLoad(summary) || null,
    ref: "ok",
  };
}

/** Libellé complet d'un jour (liste de réglage). `templateName` : nom du modèle quand il est connu. */
export function planDayLabel(day: PlanDay | null, templateName?: string | null): string {
  if (day === null) return "Libre";
  if (day.kind === "rest") return "Repos";
  if (day.kind === "muscles") return day.groups.map((id) => PLAN_GROUP_LABELS[id]).join(" + ");
  return templateName ?? "Séance supprimée";
}

/** Libellé court d'un jour (bande de la semaine, ~45 px de large). */
export function planDayShortLabel(day: PlanDay | null, templateName?: string | null): string {
  if (day === null) return "—";
  if (day.kind === "rest") return "Repos";
  if (day.kind === "muscles") {
    const [first, ...others] = day.groups;
    const head = PLAN_GROUP_SHORT_LABELS[first];
    return others.length > 0 ? `${head} +${others.length}` : head;
  }
  return templateName ?? "Supprimée";
}
