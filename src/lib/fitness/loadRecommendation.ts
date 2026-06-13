import { estimate1RM } from "./strength";

export interface LastPerformance {
  weight: number | null | undefined;
  reps: number | null | undefined;
  rpe?: number | null | undefined;
}

export interface LoadRecommendationInput {
  last: LastPerformance;
  targetReps: number;
  targetRpe: number;
  recoveryFraction?: number | null;
  increment?: number;
}

export interface LoadRecommendation {
  weight: number | null;
  workingE1RM: number | null;
  deltaPct: number | null;
  recoveryLimited: boolean;
  reason: string;
}

const isPos = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function effectiveRepCapacity(reps: number, rpe: number | null | undefined): number {
  const safeRpe = rpe != null && Number.isFinite(rpe) ? clamp(rpe, 1, 10) : 10;
  const rir = 10 - safeRpe;
  return reps + rir;
}

function weightForRepsAtRpe(e1rm: number, reps: number, rpe: number): number {
  const capacity = effectiveRepCapacity(reps, rpe);
  return e1rm / (1 + capacity / 30);
}

export function recommendLoad(input: LoadRecommendationInput): LoadRecommendation {
  const { last, targetReps, targetRpe } = input;
  const increment = isPos(input.increment) ? (input.increment as number) : 2.5;

  if (!isPos(last.weight) || !isPos(last.reps) || !isPos(targetReps) || targetRpe == null) {
    return { weight: null, workingE1RM: null, deltaPct: null, recoveryLimited: false, reason: "Données insuffisantes : aucune série de référence valide." };
  }

  const capacityReps = effectiveRepCapacity(last.reps as number, last.rpe);
  const workingE1RM = estimate1RM(last.weight, capacityReps) ?? estimate1RM(last.weight, last.reps);

  if (!isPos(workingE1RM)) {
    return { weight: null, workingE1RM: null, deltaPct: null, recoveryLimited: false, reason: "Impossible d'estimer le 1RM de travail." };
  }

  let target = weightForRepsAtRpe(workingE1RM as number, targetReps, clamp(targetRpe, 1, 10));

  let recoveryLimited = false;
  const rec = input.recoveryFraction;
  if (rec != null && Number.isFinite(rec)) {
    const f = clamp(rec, 0, 1);
    const factor = 0.85 + 0.15 * f;
    if (factor < 0.999) {
      target *= factor;
      recoveryLimited = true;
    }
  }

  const weight = Math.max(increment, Math.round(target / increment) * increment);
  const deltaPct = Math.round(((weight - (last.weight as number)) / (last.weight as number)) * 1000) / 10;

  let reason: string;
  if (recoveryLimited) reason = `Charge modulée par la récupération du muscle primaire. Cible ${targetReps} reps @ RPE ${targetRpe}.`;
  else if (deltaPct > 0) reason = `Dernière série sous le RPE cible : progression de ${deltaPct}% suggérée (${targetReps} reps @ RPE ${targetRpe}).`;
  else if (deltaPct < 0) reason = `Dernière série au-dessus du RPE cible : charge réduite de ${Math.abs(deltaPct)}% (${targetReps} reps @ RPE ${targetRpe}).`;
  else reason = `Charge maintenue pour ${targetReps} reps @ RPE ${targetRpe}.`;

  return { weight, workingE1RM: Math.round((workingE1RM as number) * 10) / 10, deltaPct, recoveryLimited, reason };
}
