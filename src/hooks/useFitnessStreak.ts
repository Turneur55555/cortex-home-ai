import { useMemo } from "react";

type WorkoutLike = { date: string };

/**
 * Streak fitness basé sur les semaines avec >= `threshold` séances.
 * Une semaine = ISO week (lundi → dimanche).
 * Retourne:
 *  - current: nombre de semaines consécutives jusqu'à la semaine en cours (ou précédente si la courante n'est pas encore validée)
 *  - best: meilleure série historique
 *  - thisWeekCount: nombre de séances dans la semaine courante
 *  - threshold: seuil utilisé
 */
export function useFitnessStreak(
  workouts: WorkoutLike[] | null | undefined,
  threshold = 3,
): { current: number; best: number; thisWeekCount: number; threshold: number } {
  return useMemo(() => {
    if (!workouts || workouts.length === 0) {
      return { current: 0, best: 0, thisWeekCount: 0, threshold };
    }

    const counts = new Map<string, number>();
    for (const w of workouts) {
      const key = isoWeekKey(new Date(w.date));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const now = new Date();
    const thisWeek = isoWeekKey(now);
    const thisWeekCount = counts.get(thisWeek) ?? 0;

    // Calcule la meilleure série en parcourant les semaines existantes triées
    const sortedKeys = Array.from(counts.keys()).sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const k of sortedKeys) {
      if (prev && weekDelta(prev, k) === 1 && (counts.get(k) ?? 0) >= threshold) {
        run += (counts.get(k) ?? 0) >= threshold ? 1 : 0;
      } else {
        run = (counts.get(k) ?? 0) >= threshold ? 1 : 0;
      }
      if (run > best) best = run;
      prev = k;
    }

    // Streak courant: remonte depuis la semaine actuelle (validée) ou la précédente
    let cursor = thisWeekCount >= threshold ? thisWeek : prevWeekKey(thisWeek);
    let current = 0;
    while ((counts.get(cursor) ?? 0) >= threshold) {
      current += 1;
      cursor = prevWeekKey(cursor);
    }

    return { current, best: Math.max(best, current), thisWeekCount, threshold };
  }, [workouts, threshold]);
}

function isoWeekKey(date: Date): string {
  // ISO week: thursday-anchored
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekDelta(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / (7 * 86400000));
}

function prevWeekKey(key: string): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeekKey(d);
}

function keyToDate(key: string): Date {
  const [y, w] = key.split("-W").map(Number);
  // jeudi de la semaine ISO
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + (4 - day));
  return simple;
}
