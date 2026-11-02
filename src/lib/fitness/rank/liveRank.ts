/**
 * LE RANG PENDANT LA SÉANCE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur).
 *
 * Le Rang est la star de CORTEX, mais il ne bougeait qu'APRÈS la séance : pendant l'effort, la
 * carte d'exercice montrait un fanion figé. Ce module fait tourner le VRAI moteur de rang
 * (`computeRankState`, même règle que le serveur — cf. `rankEngine.sql-parity.test.ts`) sur
 * l'historique PLUS les séries validées du jour, pour dire deux choses :
 *
 * 1. **où tu en es maintenant** : le grade avec les séries déjà cochées, et s'il vient de
 *    dépasser celui d'avant la séance (montée de grade → célébration immédiate) ;
 * 2. **le grade suivant** : la plus petite série (charge × répétitions habituelles) qui, ajoutée
 *    à la séance, fait franchir le grade suivant — trouvée en SIMULANT cette série dans le
 *    moteur, modificateurs de volume et confirmations Olympien/Titan compris. C'est un fait
 *    calculé (« le grade suivant est à 85 kg × 10 »), jamais une estimation : si aucune série
 *    unique ne suffit (Olympien/Titan exigent plusieurs séances étalées), on ne dit rien.
 *
 * Ce module n'écrit rien et ne décide d'aucune récompense : la promotion officielle et son XP
 * restent arbitrées côté serveur à la clôture (`verifyExerciseRanksForSession`).
 */

import { computeRankState } from "./engine";
import { classifyExerciseFamily } from "./familyClassification";
import type { RankEngineConfig, SessionInput, SessionSetInput } from "./types";
import { GRADE_NAMES } from "@/lib/fitness/rpg/grade";
import {
  LEVELS_PER_RANK,
  RANK_TIERS,
  TOTAL_TIERS,
  type RankKey,
} from "@/lib/fitness/exerciseRanks";
import { identityKey } from "@/lib/fitness/recentExercises";

/** Pas de recherche de charge : le plus petit écart affichable sur une barre ou une machine. */
export const NEXT_RANK_WEIGHT_STEP_KG = 0.5;
/** Au-delà de +60 % de la meilleure charge connue, la cible n'a plus de sens pour aujourd'hui. */
const NEXT_RANK_MAX_WEIGHT_FACTOR = 1.6;
/** Au poids du corps : jamais plus de 40 répétitions au-delà de la référence. */
const NEXT_RANK_MAX_EXTRA_REPS = 40;

/**
 * Le grade suivant, tel que le moteur le rend atteignable :
 * - `set` : une seule série aujourd'hui suffit (« Glorieux Héros à 85 kg × 10 ») ;
 * - `gate` : Olympien et Titan se CONFIRMENT dans le temps (`config.confirmation.gates`) — on dit
 *   alors ce qui manque, en faits : expérience, séances au niveau, ou étalement.
 */
export type NextRankTarget =
  | {
      kind: "set";
      tierIndex: number;
      /** `null` au poids du corps : la cible est un nombre de répétitions. */
      weight: number | null;
      reps: number;
    }
  | { kind: "experience"; tierIndex: number; done: number; required: number }
  | {
      kind: "qualifying";
      tierIndex: number;
      done: number;
      required: number;
      /** Les séries validées aujourd'hui font déjà de cette séance une séance au niveau. */
      todayQualifies: boolean;
      /** Sinon, la plus petite série qui en ferait une (`null` : introuvable, rien n'est dit). */
      todayTarget: { weight: number | null; reps: number } | null;
    }
  | { kind: "span"; tierIndex: number; spanDays: number; requiredDays: number };

export interface LiveRank {
  /** Grade avant la séance (historique seul) ; `null` : première fois sur cet exercice. */
  beforeTierIndex: number | null;
  /** Grade avec les séries validées du jour. */
  tierIndex: number;
  masteryPercent: number;
  /** Le grade du jour dépasse celui d'avant la séance. */
  promoted: boolean;
  next: NextRankTarget | null;
}

export interface LiveRankInput {
  config: RankEngineConfig;
  exerciseName: string;
  /** Séances PASSÉES de cet exercice (jamais la séance en cours). */
  history: ReadonlyArray<SessionInput>;
  /** Séries VALIDÉES de la séance en cours. */
  currentSets: ReadonlyArray<SessionSetInput>;
  bodyweightKg: number;
  /** Date (AAAA-MM-JJ) de la séance en cours. */
  today: string;
  now?: Date;
}

const LIVE_WORKOUT_ID = "__live__";

function usableSets(sets: ReadonlyArray<SessionSetInput>): SessionSetInput[] {
  return sets.filter((s) => typeof s.reps === "number" && Number.isFinite(s.reps) && s.reps > 0);
}

/** Série de référence : la plus lourde (à charge égale, la plus longue). */
function heaviestSet(sets: ReadonlyArray<SessionSetInput>): SessionSetInput | null {
  let best: SessionSetInput | null = null;
  for (const s of usableSets(sets)) {
    const w = s.weight ?? 0;
    const bw = best?.weight ?? 0;
    if (!best || w > bw || (w === bw && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  return best;
}

function tierWith(
  input: LiveRankInput,
  sets: ReadonlyArray<SessionSetInput>,
): { tierIndex: number; masteryPercent: number } {
  const sessions: SessionInput[] = [...input.history];
  const usable = usableSets(sets);
  if (usable.length > 0) {
    sessions.push({ workoutId: LIVE_WORKOUT_ID, date: input.today, sets: usable });
  }
  const result = computeRankState(
    input.config,
    input.exerciseName,
    sessions,
    input.bodyweightKg,
    input.now,
  );
  return { tierIndex: result.confirmedTierIndex, masteryPercent: result.masteryPercent };
}

/** Position brute (0..30) d'UNE séance — la même que le moteur calcule séance par séance. */
function sessionPosition(input: LiveRankInput, sets: ReadonlyArray<SessionSetInput>): number {
  const usable = usableSets(sets);
  if (usable.length === 0) return 0;
  return computeRankState(
    input.config,
    input.exerciseName,
    [{ workoutId: LIVE_WORKOUT_ID, date: input.today, sets: usable }],
    input.bodyweightKg,
    input.now,
  ).rawTierPosition;
}

interface SearchSpace {
  reps: number;
  knownTop: number;
  repsBased: boolean;
}

function searchSpace(input: LiveRankInput): SearchSpace | null {
  const lastSession = [...input.history].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  const reference = heaviestSet(input.currentSets) ?? heaviestSet(lastSession?.sets ?? []);
  if (!reference || !reference.reps) return null;
  const knownTop = Math.max(
    heaviestSet(input.currentSets)?.weight ?? 0,
    heaviestSet(lastSession?.sets ?? [])?.weight ?? 0,
  );
  const family = classifyExerciseFamily(input.exerciseName);
  const repsBased = input.config.familyStandards[family].unit === "reps";
  return { reps: reference.reps, knownTop, repsBased };
}

/** Plus petite série (charge croissante, ou répétitions au poids du corps) qui satisfait `ok`. */
function smallestSet(
  space: SearchSpace,
  ok: (candidate: SessionSetInput) => boolean,
): { weight: number | null; reps: number } | null {
  if (space.knownTop <= 0) {
    // Poids du corps : la cible est un nombre de répétitions, jamais une charge inventée.
    if (!space.repsBased) return null;
    for (let r = space.reps; r <= space.reps + NEXT_RANK_MAX_EXTRA_REPS; r += 1) {
      if (ok({ reps: r, weight: null })) return { weight: null, reps: r };
    }
    return null;
  }
  // Recherche en deux temps (le moteur tourne à chaque série validée, sur iPhone) : par pas de
  // 2,5 kg jusqu'au premier succès, puis au demi-kilo dans le dernier intervalle franchi.
  const start = Math.round(space.knownTop * 2) / 2;
  const maxWeight = space.knownTop * NEXT_RANK_MAX_WEIGHT_FACTOR;
  const coarse = NEXT_RANK_WEIGHT_STEP_KG * 5;
  let previous: number | null = null;
  for (let w = start; w <= maxWeight + 1e-9; w += coarse) {
    if (ok({ reps: space.reps, weight: w })) {
      if (previous === null) return { weight: w, reps: space.reps };
      for (let f = previous + NEXT_RANK_WEIGHT_STEP_KG; f < w; f += NEXT_RANK_WEIGHT_STEP_KG) {
        if (ok({ reps: space.reps, weight: f })) return { weight: f, reps: space.reps };
      }
      return { weight: w, reps: space.reps };
    }
    previous = w;
  }
  return null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function findNextTarget(input: LiveRankInput, currentTier: number): NextRankTarget | null {
  if (currentTier >= TOTAL_TIERS - 1) return null;
  const nextTier = currentTier + 1;
  const space = searchSpace(input);
  const current = usableSets(input.currentSets);

  // 1. Une seule série aujourd'hui suffit-elle ? Simulation dans le moteur réel.
  if (space) {
    const found = smallestSet(
      space,
      (candidate) => tierWith(input, [...current, candidate]).tierIndex > currentTier,
    );
    if (found) return { kind: "set", tierIndex: nextTier, ...found };
  }

  // 2. Sinon, le grade suivant est-il retenu par une confirmation (Olympien, Titan) ?
  const gate = [...input.config.confirmation.gates]
    .sort((a, b) => b.fromTierIndex - a.fromTierIndex)
    .find((g) => g.fromTierIndex <= nextTier);
  if (!gate) return null;

  const sessions: SessionInput[] = [...input.history];
  if (current.length > 0) {
    sessions.push({ workoutId: LIVE_WORKOUT_ID, date: input.today, sets: current });
  }
  const sorted = sessions
    .filter((s) => usableSets(s.sets).length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (sorted.length < gate.minExperienceSessions) {
    return {
      kind: "experience",
      tierIndex: nextTier,
      done: sorted.length,
      required: gate.minExperienceSessions,
    };
  }

  const qualifying = sorted
    .slice(-gate.lookbackSessions)
    .filter((s) => sessionPosition(input, s.sets) >= gate.fromTierIndex);
  if (qualifying.length < gate.sessionsRequired) {
    const todayQualifies =
      current.length > 0 && sessionPosition(input, current) >= gate.fromTierIndex;
    return {
      kind: "qualifying",
      tierIndex: nextTier,
      done: qualifying.length,
      required: gate.sessionsRequired,
      todayQualifies,
      todayTarget:
        todayQualifies || !space
          ? null
          : smallestSet(
              space,
              (candidate) => sessionPosition(input, [...current, candidate]) >= gate.fromTierIndex,
            ),
    };
  }

  const spanDays = Math.floor(
    (new Date(qualifying[qualifying.length - 1].date).getTime() -
      new Date(qualifying[0].date).getTime()) /
      MS_PER_DAY,
  );
  if (spanDays < gate.minSpanDays) {
    return { kind: "span", tierIndex: nextTier, spanDays, requiredDays: gate.minSpanDays };
  }
  return null;
}

export function evaluateLiveRank(input: LiveRankInput): LiveRank {
  const before = input.history.some((s) => usableSets(s.sets).length > 0)
    ? tierWith(input, [])
    : null;
  const live = tierWith(input, input.currentSets);
  return {
    beforeTierIndex: before ? before.tierIndex : null,
    tierIndex: live.tierIndex,
    masteryPercent: live.masteryPercent,
    promoted: before !== null && live.tierIndex > before.tierIndex,
    next: findNextTarget(input, live.tierIndex),
  };
}

// ── Historique par exercice ──────────────────────────────────────────────────

export interface RankHistoryWorkout {
  id: string;
  date: string;
  exercises?: ReadonlyArray<{
    name: string;
    exercise_reference_id?: string | null;
    exercise_sets?: ReadonlyArray<{
      reps: number | null;
      weight: number | null;
      completed?: boolean | null;
    }> | null;
  }> | null;
}

/**
 * Séances passées par identité d'exercice (`identityKey`), séries VALIDÉES seulement — même
 * lecture que `computeRanksByName`, mais SANS la séance en cours (`excludeWorkoutId`).
 */
export function rankHistoryByExercise(
  workouts: ReadonlyArray<RankHistoryWorkout> | null | undefined,
  excludeWorkoutId: string,
): Map<string, SessionInput[]> {
  const byKey = new Map<string, SessionInput[]>();
  for (const w of workouts ?? []) {
    if (w.id === excludeWorkoutId) continue;
    for (const ex of w.exercises ?? []) {
      if (!ex.name.trim()) continue;
      const sets = (ex.exercise_sets ?? [])
        .filter((s) => s.completed && s.reps != null && s.reps > 0)
        .map((s) => ({ reps: s.reps, weight: s.weight }));
      if (sets.length === 0) continue;
      const key = identityKey({ name: ex.name, exercise_reference_id: ex.exercise_reference_id });
      const list = byKey.get(key) ?? [];
      list.push({ workoutId: w.id, date: w.date, sets });
      byKey.set(key, list);
    }
  }
  return byKey;
}

// ── Libellés ──────────────────────────────────────────────────────────────────

export interface TierLabel {
  rankKey: RankKey;
  rankLabel: string;
  /** « Glorieux Héros » — grade nommé puis famille, comme `nextGradeLabel`. */
  fullLabel: string;
}

export function tierLabel(tierIndex: number): TierLabel {
  const idx = Math.max(0, Math.min(TOTAL_TIERS - 1, Math.floor(tierIndex)));
  const tier = RANK_TIERS[Math.floor(idx / LEVELS_PER_RANK)];
  const grade = GRADE_NAMES[tier.key][idx % LEVELS_PER_RANK];
  return { rankKey: tier.key, rankLabel: tier.label, fullLabel: `${grade} ${tier.label}` };
}

/**
 * La phrase de la carte d'exercice — des faits, jamais une consigne. `null` : rien à dire
 * (grade suprême, ou aucune référence pour calculer).
 */
export function describeNextRank(
  target: NextRankTarget | null,
): { title: string; detail: string } | null {
  if (!target) return null;
  const label = tierLabel(target.tierIndex).fullLabel;
  switch (target.kind) {
    case "set":
      return { title: `Prochain grade : ${label}`, detail: `à ${formatNextRankTarget(target)}` };
    case "experience":
      return {
        title: `Vers ${label}`,
        detail: `se confirme après ${target.required} séances de cet exercice (${target.done} faite${
          target.done > 1 ? "s" : ""
        })`,
      };
    case "qualifying": {
      const progress = `${target.done}/${target.required} séances au niveau`;
      if (target.todayQualifies) {
        return { title: `Vers ${label}`, detail: `aujourd'hui compte · ${progress}` };
      }
      return {
        title: `Vers ${label}`,
        detail: target.todayTarget
          ? `${progress} · aujourd'hui dès ${formatNextRankTarget(target.todayTarget)}`
          : progress,
      };
    }
    case "span":
      return {
        title: `Vers ${label}`,
        detail: `séances au niveau à étaler sur ${target.requiredDays} jours (${target.spanDays} pour l'instant)`,
      };
  }
}

/** « 85 kg × 10 », « 82,5 kg × 8 » — ou « 15 reps » au poids du corps. */
export function formatNextRankTarget(target: { weight: number | null; reps: number }): string {
  if (target.weight === null) return `${target.reps} reps`;
  const kg = target.weight.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${kg} kg × ${target.reps}`;
}

// ── Célébrations pendant la séance ───────────────────────────────────────────

export interface ExerciseLiveSnapshot {
  tierIndex: number;
  promoted: boolean;
  /** Charge la plus lourde parmi les séries VALIDÉES du jour. */
  bestWeight: number | null;
}

export type SessionHighlight =
  | { kind: "rankUp"; key: string; tierIndex: number }
  | { kind: "record"; key: string; weight: number };

/**
 * Ce qui vient de se passer entre deux états de la séance — au plus UNE célébration à la fois,
 * la montée de grade avant le record. Rien au premier calcul (reprise d'une séance) : seul un
 * changement observé pendant la séance se célèbre. Un grade déjà célébré sur cet appareil
 * (`seenTierByKey`) ne l'est jamais deux fois.
 */
export function detectSessionHighlight(
  previous: ReadonlyMap<string, ExerciseLiveSnapshot> | null,
  next: ReadonlyMap<string, ExerciseLiveSnapshot>,
  context: {
    priorRecordByKey: ReadonlyMap<string, number | null | undefined>;
    seenTierByKey: ReadonlyMap<string, number | null>;
  },
): SessionHighlight | null {
  if (!previous) return null;
  let rankUp: SessionHighlight | null = null;
  let record: SessionHighlight | null = null;
  for (const [key, now] of next) {
    const before = previous.get(key);
    if (!before) continue;
    const seen = context.seenTierByKey.get(key) ?? null;
    if (
      now.promoted &&
      now.tierIndex > before.tierIndex &&
      now.tierIndex > (seen ?? -1) &&
      (rankUp === null || (rankUp.kind === "rankUp" && now.tierIndex > rankUp.tierIndex))
    ) {
      rankUp = { kind: "rankUp", key, tierIndex: now.tierIndex };
    }
    const prior = context.priorRecordByKey.get(key);
    if (
      record === null &&
      now.bestWeight !== null &&
      now.bestWeight > (before.bestWeight ?? 0) &&
      typeof prior === "number" &&
      prior > 0 &&
      now.bestWeight > prior
    ) {
      record = { kind: "record", key, weight: now.bestWeight };
    }
  }
  return rankUp ?? record;
}
