import { format } from "date-fns";
import { simpleHash } from "./hashing";

type WorkoutWithExercises = {
  id: string;
  date: string;
  name: string;
  exercises?: Array<{
    id: string;
    name: string;
    weight: number | null;
    sets: number | null;
    reps: number | null;
    image_path?: string | null;
  }> | null;
};

export function computePRs(workouts: WorkoutWithExercises[] | null | undefined) {
  const prByName = new Map<string, number>();
  const histByName = new Map<string, Array<{ date: string; weight: number }>>();
  const volByName = new Map<string, Array<{ date: string; volume: number }>>();
  const freq = new Map<string, number>();

  if (!workouts) return { prByName, histByName, volByName, topExercises: [] as string[] };

  for (const w of workouts) {
    const sessionMax = new Map<string, number>();
    const sessionVol = new Map<string, number>();

    for (const ex of w.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      if (ex.weight != null) {
        if (!sessionMax.has(key) || ex.weight > sessionMax.get(key)!) sessionMax.set(key, ex.weight);
        if (!prByName.has(key) || ex.weight > prByName.get(key)!) prByName.set(key, ex.weight);
        const vol = (ex.sets ?? 1) * (ex.reps ?? 1) * ex.weight;
        sessionVol.set(key, (sessionVol.get(key) ?? 0) + vol);
      }
    }

    for (const [k, v] of sessionMax) {
      if (!histByName.has(k)) histByName.set(k, []);
      histByName.get(k)!.push({ date: w.date, weight: v });
    }
    for (const [k, v] of sessionVol) {
      if (!volByName.has(k)) volByName.set(k, []);
      volByName.get(k)!.push({ date: w.date, volume: v });
    }
  }

  for (const arr of histByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  for (const arr of volByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const topExercises = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && (histByName.get(k)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { prByName, histByName, volByName, topExercises };
}

export function mockWeightHistory(
  exerciseName: string,
  pr?: number,
): Array<{ date: string; weight: number }> {
  const seed = simpleHash(exerciseName);
  const base = pr ?? (30 + (seed % 60));
  const today = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (7 - i) * 7);
    const ratio = 0.82 + (i / 7) * 0.18;
    const noise = (((seed >> i) & 7) / 50) - 0.07;
    return {
      date: format(d, "yyyy-MM-dd"),
      weight: Math.max(5, Math.round((base * (ratio + noise)) * 2) / 2),
    };
  });
}
