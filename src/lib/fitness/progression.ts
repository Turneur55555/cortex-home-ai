/**
 * Progression dans le temps à partir des séries détaillées (domaine pur, zéro React).
 * S'appuie sur les primitives de sets.ts pour calculer, par séance, le 1RM estimé,
 * le tonnage et le top set — puis détecte les records (PR).
 */

import { summarizeSets, topSet, type WorkingSet } from "./sets";

/** Une séance: une date + les séries effectuées sur l'exercice. */
export interface SessionInput {
  date: string; // ISO (yyyy-mm-dd)
  sets: WorkingSet[];
  workoutId?: string;
}

/** Statistiques agrégées d'une séance, avec flags de record. */
export interface SessionStat {
  date: string;
  workoutId?: string;
  setCount: number;
  tonnage: number;
  best1RM: number | null;
  topWeight: number | null;
  /** Nouveau record de 1RM estimé par rapport aux séances précédentes. */
  isPR1RM: boolean;
  /** Nouveau record de charge (top set) par rapport aux séances précédentes. */
  isPRWeight: boolean;
}

const byDateAsc = (a: SessionInput, b: SessionInput) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/**
 * Construit la série temporelle (triée par date croissante) avec détection de PR.
 * Le premier point qui établit une valeur est considéré comme un PR de référence.
 */
export function buildSessionStats(
  sessions: ReadonlyArray<SessionInput> | null | undefined,
): SessionStat[] {
  if (!sessions || sessions.length === 0) return [];
  const sorted = [...sessions].sort(byDateAsc);
  let max1RM = -Infinity;
  let maxWeight = -Infinity;

  return sorted.map((s) => {
    const sum = summarizeSets(s.sets);
    const tw = topSet(s.sets)?.weight ?? null;

    const isPR1RM = sum.best1RM != null && sum.best1RM > max1RM;
    const isPRWeight = tw != null && tw > maxWeight;
    if (isPR1RM && sum.best1RM != null) max1RM = sum.best1RM;
    if (isPRWeight && tw != null) maxWeight = tw;

    return {
      date: s.date,
      workoutId: s.workoutId,
      setCount: sum.setCount,
      tonnage: sum.tonnage,
      best1RM: sum.best1RM,
      topWeight: tw,
      isPR1RM,
      isPRWeight,
    };
  });
}

/** Meilleures valeurs historiques (1RM estimé et charge top set). */
export function currentBests(stats: ReadonlyArray<SessionStat>): {
  best1RM: number | null;
  topWeight: number | null;
} {
  let best1RM: number | null = null;
  let topWeight: number | null = null;
  for (const s of stats) {
    if (s.best1RM != null && (best1RM == null || s.best1RM > best1RM)) best1RM = s.best1RM;
    if (s.topWeight != null && (topWeight == null || s.topWeight > topWeight))
      topWeight = s.topWeight;
  }
  return { best1RM, topWeight };
}
