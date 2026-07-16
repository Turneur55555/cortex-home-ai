// ============================================================
// Regroupement des séries d'une séance de musculation — logique PURE
// (zéro import React), extraite telle quelle de WorkoutCard.tsx pour être
// partagée sans duplication avec le module immersif Chronique
// (ChroniquePage). Le comportement est strictement identique à l'ancien
// code local de WorkoutCard : mêmes conventions legacy (1 ligne
// `exercises` = 1 série, colonnes inversées quand `weight` est NULL),
// même priorité à `exercise_sets` quand présent, même identité
// d'exercice (identityKey). Aucune donnée métier n'est modifiée.
// ============================================================

import { estimate1RM } from "./strength";
import { identityKey } from "./recentExercises";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "./muscleMapping";

export type SerieView = {
  index: number;
  reps: number | null;
  weight: number | null;
  sourceId: string;
};

export type ExerciseGroup = {
  key: string;
  name: string;
  imagePath: string | null;
  series: SerieView[];
  totalSeries: number;
  totalReps: number;
  maxWeight: number | null;
  best1RM: number | null;
  volume: number;
  sourceIds: string[];
};

// Séries détaillées éventuelles (table `exercise_sets`). Source de vérité
// quand présentes.
type DetailedSetRow = {
  id: string;
  set_number: number | null;
  reps: number | null;
  weight: number | string | null;
  completed?: boolean | null;
};

/** Forme minimale d'une ligne `exercises` consommée par ce module — un
 *  sur-ensemble structurel (les lignes réelles portent plus de champs). */
export type ExerciseLike = {
  id: string;
  name: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  image_path?: string | null;
  exercise_reference_id?: string | null;
  muscle_groups?: string[] | null;
  exercise_sets?: DetailedSetRow[] | null;
};

function rowToSeries(r: ExerciseLike): SerieView[] {
  const detailed = r.exercise_sets ?? [];
  if (detailed.length > 0) {
    // H3 : les séries explicitement non validées ne font pas partie de la séance.
    return [...detailed]
      .filter((sset) => sset.completed !== false)
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
      .map((sset, i) => ({
        index: i + 1,
        reps: sset.reps,
        weight: sset.weight == null ? null : Number(sset.weight),
        sourceId: r.id,
      }));
  }
  // Legacy : 1 ligne `exercises` = 1 série. Si `weight` est NULL, la colonne `sets`
  // contient en réalité les reps et `reps` la charge (kg).
  const hasExplicitWeight = r.weight != null;
  const reps = hasExplicitWeight ? r.reps : (r.sets ?? r.reps);
  const weight = hasExplicitWeight ? r.weight : r.sets != null ? r.reps : null;
  return [{ index: 1, reps, weight, sourceId: r.id }];
}

export function expandToSeries(rows: ExerciseLike[]): SerieView[] {
  return rows.flatMap((r) => rowToSeries(r)).map((sset, i) => ({ ...sset, index: i + 1 }));
}

export function buildGroups(rows: ExerciseLike[]): ExerciseGroup[] {
  const byKey = new Map<string, ExerciseLike[]>();
  for (const r of rows) {
    if (!r.name.trim()) continue;
    // Identité par exercise_reference_id en priorité (même fonction que le
    // reste de la base), filet par nom normalisé sinon.
    const key = identityKey({ name: r.name, exercise_reference_id: r.exercise_reference_id });
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const groups: ExerciseGroup[] = [];
  for (const [key, list] of byKey) {
    const series = expandToSeries(list);
    let totalReps = 0;
    let volume = 0;
    let maxWeight: number | null = null;
    let best1RM: number | null = null;
    for (const s of series) {
      if (s.reps != null) totalReps += s.reps;
      if (s.weight != null) {
        maxWeight = maxWeight == null ? s.weight : Math.max(maxWeight, s.weight);
        if (s.reps != null) {
          volume += s.reps * s.weight;
          const rm = estimate1RM(s.weight, s.reps);
          if (rm != null && (best1RM == null || rm > best1RM)) best1RM = rm;
        }
      }
    }
    groups.push({
      key,
      name: list[0].name,
      imagePath: list.find((r) => r.image_path)?.image_path ?? null,
      series,
      totalSeries: series.length,
      totalReps,
      maxWeight,
      best1RM,
      volume,
      sourceIds: Array.from(new Set(list.map((r) => r.id))),
    });
  }
  return groups;
}

// ─── Sollicitation musculaire d'UNE séance ────────────────────────────────────

export type MuscleActivation = {
  id: MuscleId;
  label: string;
  sets: number;
  volume: number;
  exercises: string[];
};

/**
 * Répartit l'effort d'une séance sur les muscles sollicités — même source
 * que le Scan des Titans (recovery.ts) : mapping regex `exerciseToMuscles`,
 * filet sur `muscle_groups` résolus par l'IA pour les exercices custom.
 * Purement descriptif : agrège séries et tonnage réels par muscle, n'invente
 * aucune donnée. Résultat trié par volume décroissant (muscle le plus
 * encaissé en tête).
 */
export function sessionMuscleActivation(rows: ExerciseLike[]): MuscleActivation[] {
  const acc = new Map<MuscleId, { sets: number; volume: number; exercises: Set<string> }>();
  const groups = buildGroups(rows);

  for (const g of groups) {
    const regexMuscles = exerciseToMuscles(g.name);
    const muscles: MuscleId[] =
      regexMuscles.length > 0
        ? regexMuscles
        : (rows.find((r) => r.name === g.name)?.muscle_groups ?? []).filter(
            (m): m is MuscleId => m in MUSCLE_META,
          );
    for (const m of muscles) {
      if (!acc.has(m)) acc.set(m, { sets: 0, volume: 0, exercises: new Set() });
      const entry = acc.get(m)!;
      entry.sets += g.totalSeries;
      entry.volume += g.volume;
      entry.exercises.add(g.name);
    }
  }

  return Array.from(acc.entries())
    .map(([id, v]) => ({
      id,
      label: MUSCLE_META[id].label,
      sets: v.sets,
      volume: Math.round(v.volume),
      exercises: Array.from(v.exercises),
    }))
    .sort((a, b) => b.volume - a.volume || b.sets - a.sets);
}
