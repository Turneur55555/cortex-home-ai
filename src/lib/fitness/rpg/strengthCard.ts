/**
 * LA CARTE DE FORCE (fiche de personnage de l'Accueil) — LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro couleur). Validée sur maquette par Nathan le
 * 02/11/2026 (« carte obsidienne », placée sous « Ton rythme ») : sous le Titre, une ligne par
 * GROUPE MUSCULAIRE — son exercice phare, son record de charge, et ce que ce record a gagné.
 *
 * ── Ce que la carte affiche : des FAITS ──
 *  - **Exercice phare d'un groupe** = l'exercice CHARGÉ dont le record est le plus lourd sur la
 *    fenêtre (`STRENGTH_WINDOW_DAYS`), fait au moins `MIN_SESSIONS` fois (une saisie isolée, une
 *    faute de frappe, ne fait pas un phare). Égalité → le plus pratiqué, puis le plus récent.
 *    Les exercices au poids du corps (tractions, dips : charge vide) n'ont pas de record en kg.
 *  - **Record** = la charge maximale d'une série COMPTÉE (répétitions > 0, charge > 0, cochée),
 *    à défaut les colonnes résumé d'une saisie sans séries détaillées.
 *  - **Progression** = record − charge maximale de la PREMIÈRE séance de l'exercice dans la
 *    fenêtre. Jamais négative affichée comme un gain : 0 = rien gagné, et on ne l'invente pas.
 *  - **Fenêtre glissante** de 6 mois, jamais avant le 1er février 2026 (décision de Nathan du
 *    02/11/2026 : l'historique importé d'avant ne sert de base à rien).
 *
 * ── Groupes ──
 * La catégorie du référentiel (`exercise_reference.category`) décide ; à défaut (une vingtaine de
 * références n'en ont pas — curl inversé, pushdown corde…), quelques mots-clés du nom.
 */

import { addDaysYMD } from "@/lib/dates";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { identityKey } from "@/lib/fitness/recentExercises";

export type StrengthGroup = "pec" | "dos" | "epaules" | "bras" | "jambes";

export const STRENGTH_GROUP_ORDER: readonly StrengthGroup[] = [
  "pec",
  "dos",
  "epaules",
  "bras",
  "jambes",
];

export const STRENGTH_GROUP_LABELS: Record<StrengthGroup, string> = {
  pec: "PEC",
  dos: "DOS",
  epaules: "ÉPAULES",
  bras: "BRAS",
  jambes: "JAMBES",
};

/** Fenêtre glissante de la carte. */
export const STRENGTH_WINDOW_DAYS = 183;
/** Plancher absolu : rien d'antérieur (décision de Nathan, 02/11/2026). */
export const STRENGTH_FLOOR_DATE = "2026-02-01";
/** En dessous, un exercice n'est pas un « phare » (une saisie isolée n'est pas un record fiable). */
export const MIN_SESSIONS = 3;

const CATEGORY_GROUPS: Record<string, StrengthGroup> = {
  pectoraux: "pec",
  dos: "dos",
  epaules: "epaules",
  biceps: "bras",
  triceps: "bras",
  "avant bras": "bras",
  jambes: "jambes",
  fessiers: "jambes",
  mollets: "jambes",
};

/** Mots-clés de repli, testés DANS CET ORDRE (les jambes avant « extension », etc.). */
const NAME_KEYWORDS: ReadonlyArray<[StrengthGroup, readonly string[]]> = [
  [
    "jambes",
    [
      "squat",
      "presse a cuisse",
      "leg press",
      "leg extension",
      "leg curl",
      "fente",
      "mollet",
      "fessier",
      "ischio",
      "quadriceps",
      "hip thrust",
      "souleve",
    ],
  ],
  ["bras", ["curl", "triceps", "biceps", "pushdown", "extension", "wrist", "marteau"]],
  ["pec", ["pec", "chest", "dips", "ecarte", "developpe couche", "developpe incline", "pompe"]],
  ["epaules", ["epaule", "shoulder", "elevation", "face pull", "oiseau", "militaire"]],
  ["dos", ["tirage", "rowing", "traction", "pull", "dos", "lat "]],
];

export function groupForCategory(category: string | null | undefined): StrengthGroup | null {
  if (!category) return null;
  return CATEGORY_GROUPS[normalize(category)] ?? null;
}

export function groupFromName(name: string): StrengthGroup | null {
  const key = ` ${normalize(name)} `;
  for (const [group, words] of NAME_KEYWORDS) {
    if (words.some((w) => key.includes(w))) return group;
  }
  return null;
}

// ── Entrées ─────────────────────────────────────────────────────────────

export interface StrengthWorkout {
  id: string;
  date: string;
  status: string;
  discipline?: string | null;
}

export interface StrengthExercise {
  id: string;
  workout_id: string;
  name: string;
  exercise_reference_id?: string | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
}

export interface StrengthSet {
  exercise_id: string;
  reps: number | null;
  weight: number | null;
  completed: boolean | null;
}

export interface StrengthCardInput {
  workouts: readonly StrengthWorkout[];
  exercises: readonly StrengthExercise[];
  sets: readonly StrengthSet[];
  /** Catégorie du référentiel par `exercise_reference_id` (peut être partielle, ou vide hors ligne). */
  categoryByReferenceId: ReadonlyMap<string, string | null>;
  todayDate: string;
}

// ── Sorties ─────────────────────────────────────────────────────────────

export interface StrengthRow {
  group: StrengthGroup;
  label: string;
  exerciseName: string;
  recordKg: number;
  /** ≥ 0. 0 = le record n'a pas bougé depuis la première séance de la fenêtre. */
  progressionKg: number;
  sessions: number;
  /** Date (yyyy-MM-dd) de la première séance de l'exercice dans la fenêtre. */
  since: string;
  /** Record rapporté au plus lourd de la carte (0..1], pour la barre. */
  barRatio: number;
}

export interface StrengthCard {
  rows: StrengthRow[];
  /** La plus ancienne des dates `since` affichées — « progression depuis juin ». `null` sans ligne. */
  since: string | null;
}

export function strengthWindowStart(todayDate: string): string {
  const rolling = addDaysYMD(todayDate, -STRENGTH_WINDOW_DAYS);
  return rolling > STRENGTH_FLOOR_DATE ? rolling : STRENGTH_FLOOR_DATE;
}

/** Charge maximale exploitable d'un exercice dans UNE séance ; `null` si aucune. */
export function sessionTopLoad(
  exercise: StrengthExercise,
  sets: readonly StrengthSet[],
): number | null {
  let top: number | null = null;
  for (const s of sets) {
    if (s.completed !== true) continue;
    if (typeof s.reps !== "number" || s.reps <= 0) continue;
    if (typeof s.weight !== "number" || !Number.isFinite(s.weight) || s.weight <= 0) continue;
    if (top === null || s.weight > top) top = s.weight;
  }
  if (top !== null) return top;
  // Saisie sans séries détaillées (« Enregistrer comme séance passée ») : les colonnes résumé.
  if (sets.length === 0 && (exercise.sets ?? 0) > 0 && (exercise.reps ?? 0) > 0) {
    const w = exercise.weight;
    if (typeof w === "number" && Number.isFinite(w) && w > 0) return w;
  }
  return null;
}

interface Track {
  key: string;
  group: StrengthGroup;
  name: string;
  /** Une entrée par séance : date + charge max. */
  sessions: Array<{ date: string; created: string; load: number }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildStrengthCard(input: StrengthCardInput): StrengthCard {
  const { workouts, exercises, sets, categoryByReferenceId, todayDate } = input;
  const from = strengthWindowStart(todayDate);

  const workoutById = new Map<string, StrengthWorkout>();
  for (const w of workouts) {
    if (w.status !== "completed") continue;
    if ((w.discipline ?? "muscu") !== "muscu") continue;
    if (w.date < from || w.date > todayDate) continue;
    workoutById.set(w.id, w);
  }

  const setsByExercise = new Map<string, StrengthSet[]>();
  for (const s of sets) {
    const bucket = setsByExercise.get(s.exercise_id);
    if (bucket) bucket.push(s);
    else setsByExercise.set(s.exercise_id, [s]);
  }

  const tracks = new Map<string, Track>();
  for (const ex of exercises) {
    const workout = workoutById.get(ex.workout_id);
    if (!workout || !ex.name.trim()) continue;
    const refId = ex.exercise_reference_id ?? null;
    const group =
      (refId ? groupForCategory(categoryByReferenceId.get(refId)) : null) ?? groupFromName(ex.name);
    if (!group) continue;
    const load = sessionTopLoad(ex, setsByExercise.get(ex.id) ?? []);
    if (load === null) continue;
    const key = identityKey({ name: ex.name, exercise_reference_id: refId });
    let track = tracks.get(key);
    if (!track) {
      track = { key, group, name: ex.name.trim(), sessions: [] };
      tracks.set(key, track);
    }
    const existing = track.sessions.find((s) => s.created === workout.id);
    if (existing) existing.load = Math.max(existing.load, load);
    else track.sessions.push({ date: workout.date, created: workout.id, load });
  }

  const best = new Map<StrengthGroup, { track: Track; record: number; last: string }>();
  for (const track of tracks.values()) {
    if (track.sessions.length < MIN_SESSIONS) continue;
    const record = Math.max(...track.sessions.map((s) => s.load));
    const last = track.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
    const current = best.get(track.group);
    const better =
      !current ||
      record > current.record ||
      (record === current.record &&
        (track.sessions.length > current.track.sessions.length ||
          (track.sessions.length === current.track.sessions.length && last > current.last)));
    if (better) best.set(track.group, { track, record, last });
  }

  const chosen = STRENGTH_GROUP_ORDER.filter((g) => best.has(g)).map((g) => best.get(g)!);
  const heaviest = Math.max(0, ...chosen.map((c) => c.record));
  const rows: StrengthRow[] = chosen.map(({ track, record }) => {
    const ordered = [...track.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const first = ordered[0];
    return {
      group: track.group,
      label: STRENGTH_GROUP_LABELS[track.group],
      exerciseName: track.name,
      recordKg: round1(record),
      progressionKg: round1(Math.max(0, record - first.load)),
      sessions: track.sessions.length,
      since: first.date,
      barRatio: heaviest > 0 ? record / heaviest : 0,
    };
  });

  const since = rows.reduce<string | null>(
    (m, r) => (m === null || r.since < m ? r.since : m),
    null,
  );
  return { rows, since };
}

/** « 62,5 » — format français. */
export function formatKgFr(kg: number): string {
  return kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** « depuis juin » — le mois de la plus ancienne séance retenue. */
export function describeSince(since: string | null): string | null {
  if (!since) return null;
  const month = new Date(`${since}T12:00:00`).toLocaleDateString("fr-FR", { month: "long" });
  return `progression depuis ${month}`;
}
