/**
 * « JE L'AI FAITE » — LA SAISIE APRÈS COUP ASSUMÉE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur).
 *
 * ── Le constat (production, 19/10 → 30/10/2026) ──
 * Six séances sur sept ont été saisies APRÈS l'entraînement : deux par « Enregistrer comme séance
 * passée » (rattrapées deux et trois jours plus tard, sans aucune série détaillée ni durée), quatre
 * en démarrant la séance en direct puis en cochant toutes les séries en une à deux minutes (durée
 * enregistrée : « 1 min »). La saisie en direct n'est pas le geste réel : on la remplace, pour ce
 * cas, par une confirmation.
 *
 * ── Ce que fait ce module ──
 * 1. `buildDoneSessionDraft` pré-remplit la séance à confirmer : avec les séries de la DERNIÈRE
 *    séance terminée du même nom (le geste le plus probable est « comme la dernière fois »), sinon
 *    avec les valeurs par défaut de la séance sauvegardée. Sans l'un ni l'autre : `null`, et le
 *    bouton n'est pas proposé — on n'invente jamais une séance.
 * 2. `defaultDoneSessionDuration` propose une durée tirée d'un fait (la dernière durée plausible
 *    d'une séance du même nom, sinon de n'importe quelle séance). Le joueur la confirme ou la
 *    corrige : elle n'est jamais enregistrée sans être passée sous ses yeux.
 * 3. `validateDoneSession` transforme le brouillon en données à écrire. Les champs passent par
 *    `parseSetFieldInput` (INVARIANTS §2.4) : une saisie inexploitable n'atteint jamais la base.
 *
 * L'écriture elle-même (`useLogDoneWorkout`, `hooks/use-fitness.ts`) suit le chemin d'une séance
 * vécue en direct — séance créée active, séries écrites cochées, PUIS clôture avec sa barrière de
 * dépendances — pour que le trigger serveur d'XP voie les séries (INVARIANTS §3.1, §3.2).
 */

import { addDaysYMD } from "@/lib/dates";
import { identityKey } from "@/lib/fitness/recentExercises";
import { parseSetFieldInput, setsTonnage } from "@/lib/fitness/sets";
import {
  MAX_PLAUSIBLE_SESSION_MINUTES,
  plausibleDurationMinutes,
} from "@/lib/fitness/sessionDuration";
import { isCountedWorkout, type WorkoutLike } from "@/lib/fitness/weeklyPlan";

// ── Entrées ─────────────────────────────────────────────────────────────

/** Ce que l'Accueil demande de confirmer : une séance, un jour. */
export interface DoneSessionTarget {
  /** Date locale yyyy-MM-dd de la séance (aujourd'hui, ou un jour récent à rattraper). */
  date: string;
  /** Nom de la séance (celui de la séance sauvegardée prévue). */
  name: string;
  /** La séance sauvegardée prévue ce jour-là, si c'en est une. */
  templateId: string | null;
}

/** Une série telle qu'elle est stockée. */
export interface SourceSet {
  set_number?: number | null;
  reps: number | null | undefined;
  weight: number | null | undefined;
  completed?: boolean | null;
}

/** Un exercice d'une séance de l'historique (`useWorkouts` s'y range tel quel). */
export interface SourceExercise {
  name: string | null;
  position?: number | null;
  image_path?: string | null;
  exercise_reference_id?: string | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  exercise_sets?: readonly SourceSet[] | null;
}

/** Une séance de l'historique (`useWorkouts` s'y range telle quelle). */
export interface SourceWorkout extends WorkoutLike {
  name: string;
  duration_minutes?: number | null;
  created_at?: string | null;
  exercises?: readonly SourceExercise[] | null;
}

/** Une séance sauvegardée (`WorkoutTemplateRow` s'y range telle quelle). */
export interface SourceTemplate {
  id: string;
  name: string;
  exercises: readonly {
    name: string;
    position: number;
    default_sets: number | null;
    default_reps: number | null;
    default_weight: number | null;
  }[];
}

// ── Brouillon ───────────────────────────────────────────────────────────

/** Une série en cours de confirmation — en texte, tel que dans le champ. */
export interface DoneSetDraft {
  reps: string;
  weight: string;
}

export interface DoneExerciseDraft {
  /** Identité stable (référentiel, sinon nom normalisé). */
  key: string;
  name: string;
  imagePath: string | null;
  exerciseReferenceId: string | null;
  /** Décoché = « pas fait cette fois » : l'exercice n'est pas enregistré. */
  included: boolean;
  sets: DoneSetDraft[];
}

export interface DoneSessionDraft {
  name: string;
  date: string;
  /** D'où viennent les valeurs pré-remplies — dit tel quel à l'écran. */
  source:
    | { kind: "last-session"; workoutId: string; date: string }
    | { kind: "template"; templateId: string };
  exercises: DoneExerciseDraft[];
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("fr-FR");
}

function newestFirst(a: SourceWorkout, b: SourceWorkout): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

/** Valeur stockée → champ, au format français (« 62,5 »), relu par `parseSetFieldInput`. */
const toField = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "" : String(value).replace(".", ",");

/**
 * Les séries d'un exercice de l'historique, dans l'ordre. Les séries COCHÉES d'abord (une
 * série saisie mais pas cochée n'a pas été faite) ; à défaut, toutes les séries détaillées ;
 * à défaut, les colonnes résumé — avec la même convention que « Refaire en live »
 * (`useStartWorkoutFromTemplate`) : sans charge, `sets` porte les répétitions et `reps` la charge
 * (format de saisie antérieur à `exercise_sets`).
 */
export function setsFromHistoryExercise(exercise: SourceExercise): DoneSetDraft[] {
  const detailed = [...(exercise.exercise_sets ?? [])]
    .filter((s) => typeof s.reps === "number" && s.reps > 0)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  const done = detailed.filter((s) => s.completed === true);
  const chosen = done.length > 0 ? done : detailed;
  if (chosen.length > 0) {
    return chosen.map((s) => ({ reps: toField(s.reps), weight: toField(s.weight) }));
  }
  if (exercise.weight != null) {
    const count = Math.max(1, exercise.sets ?? 1);
    return Array.from({ length: count }, () => ({
      reps: toField(exercise.reps),
      weight: toField(exercise.weight),
    }));
  }
  if (exercise.sets != null || exercise.reps != null) {
    return [{ reps: toField(exercise.sets), weight: toField(exercise.reps) }];
  }
  return [];
}

/**
 * La dernière séance de musculation TERMINÉE portant ce nom, strictement antérieure à
 * `beforeDate`, qui a au moins un exercice avec une série exploitable. `null` sinon.
 */
export function lastSameNamedWorkout<W extends SourceWorkout>(
  workouts: readonly W[],
  name: string,
  beforeDate: string,
): W | null {
  const wanted = normalizeName(name);
  if (wanted === "") return null;
  const candidates = workouts
    .filter((w) => isCountedWorkout(w) && normalizeName(w.name) === wanted && w.date < beforeDate)
    .sort(newestFirst);
  for (const candidate of candidates) {
    if ((candidate.exercises ?? []).some((ex) => setsFromHistoryExercise(ex).length > 0)) {
      return candidate;
    }
  }
  return null;
}

function draftFromWorkout(workout: SourceWorkout): DoneExerciseDraft[] {
  const ordered = [...(workout.exercises ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const byKey = new Map<string, DoneExerciseDraft>();
  for (const exercise of ordered) {
    const name = (exercise.name ?? "").trim();
    if (!name) continue;
    const sets = setsFromHistoryExercise(exercise);
    if (sets.length === 0) continue;
    const key = identityKey({ name, exercise_reference_id: exercise.exercise_reference_id });
    const existing = byKey.get(key);
    if (existing) {
      existing.sets.push(...sets);
      continue;
    }
    byKey.set(key, {
      key,
      name,
      imagePath: exercise.image_path ?? null,
      exerciseReferenceId: exercise.exercise_reference_id ?? null,
      included: true,
      sets,
    });
  }
  return Array.from(byKey.values());
}

function draftFromTemplate(template: SourceTemplate): DoneExerciseDraft[] {
  const ordered = [...template.exercises].sort((a, b) => a.position - b.position);
  const byKey = new Map<string, DoneExerciseDraft>();
  for (const exercise of ordered) {
    if (!exercise.name.trim()) continue;
    const key = identityKey({ name: exercise.name });
    const count = Math.max(1, exercise.default_sets ?? 1);
    const sets = Array.from({ length: count }, () => ({
      reps: toField(exercise.default_reps),
      weight: toField(exercise.default_weight),
    }));
    const existing = byKey.get(key);
    if (existing) {
      existing.sets.push(...sets);
      continue;
    }
    byKey.set(key, {
      key,
      name: exercise.name.trim(),
      imagePath: null,
      exerciseReferenceId: null,
      included: true,
      sets,
    });
  }
  return Array.from(byKey.values());
}

/**
 * Le brouillon à confirmer. Priorité à la dernière séance du même nom (ses vraies séries), puis
 * à la séance sauvegardée prévue. `null` sans aucune source : on ne propose pas « Je l'ai faite »
 * pour une séance qu'on ne sait pas pré-remplir.
 */
export function buildDoneSessionDraft(input: {
  target: DoneSessionTarget;
  workouts: readonly SourceWorkout[];
  template: SourceTemplate | null;
}): DoneSessionDraft | null {
  const { target, workouts, template } = input;
  const name = target.name.trim();
  if (name === "") return null;

  const reference = lastSameNamedWorkout(workouts, name, target.date);
  if (reference) {
    const exercises = draftFromWorkout(reference);
    if (exercises.length > 0) {
      return {
        name,
        date: target.date,
        source: { kind: "last-session", workoutId: reference.id, date: reference.date },
        exercises,
      };
    }
  }

  if (template && template.id === target.templateId) {
    const exercises = draftFromTemplate(template);
    if (exercises.length > 0) {
      return {
        name,
        date: target.date,
        source: { kind: "template", templateId: template.id },
        exercises,
      };
    }
  }
  return null;
}

/**
 * Peut-on pré-remplir cette séance ? Même règle que `buildDoneSessionDraft`, sans le
 * construire : une séance sauvegardée connue suffit (elle porte au moins un exercice dès qu'elle
 * en a un ; sinon le brouillon le dira à l'ouverture), ou une séance du même nom dans l'historique.
 */
export function canPrefillDoneSession(input: {
  target: DoneSessionTarget;
  workouts: readonly SourceWorkout[];
  /** Les modèles connus (résumés) — `null` = pas encore chargés. */
  templateExerciseCount: number | null;
}): boolean {
  const { target, workouts, templateExerciseCount } = input;
  if (target.name.trim() === "") return false;
  if (target.templateId !== null && templateExerciseCount !== null && templateExerciseCount > 0) {
    return true;
  }
  return lastSameNamedWorkout(workouts, target.name, target.date) !== null;
}

// ── Durée proposée ──────────────────────────────────────────────────────

/** En dessous, une durée enregistrée n'est pas celle d'un entraînement (saisie express « 1 min »). */
export const MIN_REAL_SESSION_MINUTES = 10;

export interface DurationSuggestion {
  minutes: number;
  /** Le fait d'où elle vient : la séance du même nom, ou la dernière séance tout court. */
  from: { kind: "same-name" | "last-session"; date: string };
}

const roundTo5 = (minutes: number): number => Math.max(5, Math.round(minutes / 5) * 5);

function realDuration(workout: SourceWorkout): number | null {
  const minutes = plausibleDurationMinutes(workout.duration_minutes ?? null);
  return minutes !== null && minutes >= MIN_REAL_SESSION_MINUTES ? minutes : null;
}

/**
 * La durée proposée : la dernière durée RÉELLE (≥ 10 min, plausible) d'une séance du même nom
 * avant `beforeDate`, sinon celle de la dernière séance terminée. Arrondie à 5 min — c'est une
 * proposition à confirmer, pas une mesure. `null` si l'historique n'en contient aucune.
 */
export function defaultDoneSessionDuration(
  workouts: readonly SourceWorkout[],
  name: string,
  beforeDate: string,
): DurationSuggestion | null {
  const wanted = normalizeName(name);
  const past = workouts.filter((w) => isCountedWorkout(w) && w.date < beforeDate).sort(newestFirst);
  for (const workout of past) {
    if (normalizeName(workout.name) !== wanted) continue;
    const minutes = realDuration(workout);
    if (minutes !== null) {
      return { minutes: roundTo5(minutes), from: { kind: "same-name", date: workout.date } };
    }
  }
  for (const workout of past) {
    const minutes = realDuration(workout);
    if (minutes !== null) {
      return { minutes: roundTo5(minutes), from: { kind: "last-session", date: workout.date } };
    }
  }
  return null;
}

/** Les durées proposées en un appui. */
export const DURATION_CHOICES: readonly number[] = [30, 45, 60, 75, 90];

// ── Validation ──────────────────────────────────────────────────────────

export interface DoneSessionPayload {
  name: string;
  date: string;
  durationMinutes: number;
  exercises: {
    name: string;
    imagePath: string | null;
    exerciseReferenceId: string | null;
    sets: { reps: number; weight: number }[];
  }[];
}

export type DoneSessionValidation =
  | { ok: true; payload: DoneSessionPayload; totalSets: number; volumeKg: number }
  | {
      ok: false;
      reason: "no-sets" | "invalid-set" | "missing-weight" | "duration" | "future-date";
      /** Exercice concerné (pour `invalid-set` / `missing-weight`). */
      exerciseName?: string;
    };

/** Une série : vide (ignorée), exploitable, ou à corriger. */
export type ParsedDoneSet =
  | { kind: "empty" }
  | { kind: "set"; reps: number; weight: number }
  | { kind: "invalid" }
  | { kind: "missing-weight" };

/**
 * Une ligne entièrement vide est ignorée (une série prévue qu'on n'a pas faite). Des
 * répétitions sans charge sont à compléter — la charge 0 se saisit (poids du corps), elle ne se
 * devine jamais. Une charge sans répétitions, ou des répétitions à 0, ne sont pas une série.
 */
export function parseDoneSet(set: DoneSetDraft): ParsedDoneSet {
  const reps = parseSetFieldInput("reps", set.reps);
  const weight = parseSetFieldInput("weight", set.weight);
  if (reps.kind === "cleared" && weight.kind === "cleared") return { kind: "empty" };
  if (reps.kind === "invalid" || weight.kind === "invalid") return { kind: "invalid" };
  if (reps.kind !== "value" || reps.value <= 0) return { kind: "invalid" };
  if (weight.kind !== "value") return { kind: "missing-weight" };
  return { kind: "set", reps: reps.value, weight: weight.value };
}

/** Durée saisie → minutes entières entre 1 et la borne plausible, sinon `null`. */
export function parseDoneDuration(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^\d{1,3}$/.test(cleaned)) return null;
  const minutes = Number(cleaned);
  if (minutes < 1 || minutes > MAX_PLAUSIBLE_SESSION_MINUTES) return null;
  return minutes;
}

export function validateDoneSession(
  draft: DoneSessionDraft,
  durationRaw: string,
  todayDate: string,
): DoneSessionValidation {
  if (draft.date > todayDate) return { ok: false, reason: "future-date" };

  const exercises: DoneSessionPayload["exercises"] = [];
  for (const exercise of draft.exercises) {
    if (!exercise.included) continue;
    const sets: { reps: number; weight: number }[] = [];
    for (const set of exercise.sets) {
      const parsed = parseDoneSet(set);
      if (parsed.kind === "empty") continue;
      if (parsed.kind === "invalid") {
        return { ok: false, reason: "invalid-set", exerciseName: exercise.name };
      }
      if (parsed.kind === "missing-weight") {
        return { ok: false, reason: "missing-weight", exerciseName: exercise.name };
      }
      sets.push({ reps: parsed.reps, weight: parsed.weight });
    }
    if (sets.length === 0) continue;
    exercises.push({
      name: exercise.name,
      imagePath: exercise.imagePath,
      exerciseReferenceId: exercise.exerciseReferenceId,
      sets,
    });
  }

  const allSets = exercises.flatMap((e) => e.sets);
  if (allSets.length === 0) return { ok: false, reason: "no-sets" };

  const durationMinutes = parseDoneDuration(durationRaw);
  if (durationMinutes === null) return { ok: false, reason: "duration" };

  return {
    ok: true,
    payload: { name: draft.name, date: draft.date, durationMinutes, exercises },
    totalSets: allSets.length,
    volumeKg: Math.round(setsTonnage(allSets)),
  };
}

/** Le message qui accompagne un refus — une phrase, sans reproche. */
export function describeDoneSessionError(
  validation: Extract<DoneSessionValidation, { ok: false }>,
): string {
  switch (validation.reason) {
    case "no-sets":
      return "Coche au moins un exercice avec une série.";
    case "invalid-set":
      return `Une série de « ${validation.exerciseName} » est à corriger.`;
    case "missing-weight":
      return `Indique la charge sur « ${validation.exerciseName} » (0 pour le poids du corps).`;
    case "duration":
      return `Indique une durée entre 1 et ${MAX_PLAUSIBLE_SESSION_MINUTES} minutes.`;
    case "future-date":
      return "On ne peut pas enregistrer une séance à venir.";
  }
}

// ── Rattrapage ──────────────────────────────────────────────────────────

/** Combien de jours en arrière on propose de rattraper une séance prévue (mesure : J+2, J+3). */
export const CATCH_UP_DAYS = 3;

/** Le jour le plus ancien qu'on propose encore de rattraper. */
export function oldestCatchUpDate(todayDate: string): string {
  return addDaysYMD(todayDate, -CATCH_UP_DAYS);
}

// ── Affichage ───────────────────────────────────────────────────────────

/** « 62,5 » — format français, sans zéro inutile. */
export function formatSetWeight(kg: number): string {
  return kg.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/**
 * Le résumé d'un exercice du brouillon, sur une ligne : « 4 × 10 · 60 kg » quand toutes les
 * séries sont identiques, « 4 séries · jusqu'à 60 kg » sinon, « poids du corps » à 0 kg.
 * Seules les séries exploitables comptent ; une ligne vide n'est pas une série.
 */
export function describeDoneExercise(sets: readonly DoneSetDraft[]): string {
  const parsed = sets
    .map(parseDoneSet)
    .filter((s): s is Extract<ParsedDoneSet, { kind: "set" }> => s.kind === "set");
  if (parsed.length === 0) return "Aucune série";
  const [first] = parsed;
  const load = (kg: number) => (kg > 0 ? `${formatSetWeight(kg)} kg` : "poids du corps");
  if (parsed.every((s) => s.reps === first.reps && s.weight === first.weight)) {
    return `${parsed.length} × ${first.reps} · ${load(first.weight)}`;
  }
  const heaviest = Math.max(...parsed.map((s) => s.weight));
  const count = `${parsed.length} série${parsed.length > 1 ? "s" : ""}`;
  return heaviest > 0 ? `${count} · jusqu'à ${load(heaviest)}` : `${count} · poids du corps`;
}
