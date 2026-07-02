import { estimate1RM } from "./strength";
export interface WorkingSet { reps: number | null | undefined; weight: number | null | undefined; }
export function isValidSet(s: WorkingSet | null | undefined): boolean {
  if (!s) return false; const { reps, weight } = s;
  return reps != null && weight != null && Number.isFinite(reps) && Number.isFinite(weight) && reps > 0 && weight > 0;
}
export function setsTonnage(sets: ReadonlyArray<WorkingSet> | null | undefined): number {
  if (!sets || sets.length === 0) return 0;
  return sets.reduce((acc, s) => isValidSet(s) ? acc + (s.reps as number) * (s.weight as number) : acc, 0);
}
export function bestEstimated1RM(sets: ReadonlyArray<WorkingSet> | null | undefined): number | null {
  if (!sets || sets.length === 0) return null; let best: number | null = null;
  for (const s of sets) { if (!isValidSet(s)) continue; const rm = estimate1RM(s.weight, s.reps); if (rm != null && (best == null || rm > best)) best = rm; }
  return best;
}
export function topSet(sets: ReadonlyArray<WorkingSet> | null | undefined): WorkingSet | null {
  if (!sets || sets.length === 0) return null; let best: WorkingSet | null = null;
  for (const s of sets) { if (!isValidSet(s)) continue;
    if (best == null || (s.weight as number) > (best.weight as number) || ((s.weight as number) === (best.weight as number) && (s.reps as number) > (best.reps as number))) best = s; }
  return best;
}
export function totalReps(sets: ReadonlyArray<WorkingSet> | null | undefined): number {
  if (!sets || sets.length === 0) return 0;
  return sets.reduce((acc, s) => isValidSet(s) ? acc + (s.reps as number) : acc, 0);
}
export interface SetsSummary { setCount: number; tonnage: number; best1RM: number | null; totalReps: number; }
export function summarizeSets(sets: ReadonlyArray<WorkingSet> | null | undefined): SetsSummary {
  const valid = (sets ?? []).filter(isValidSet);
  return { setCount: valid.length, tonnage: setsTonnage(sets), best1RM: bestEstimated1RM(sets), totalReps: totalReps(sets) };
}
