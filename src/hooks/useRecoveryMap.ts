import { useMemo } from "react";
import { computeRecovery, type MuscleRecovery } from "@/lib/fitness/recovery";
import type { MuscleId } from "@/lib/fitness/muscleMapping";

type WorkoutInput = {
  date: string;
  exercises?: Array<{ name: string }> | null;
};

export function useRecoveryMap(workouts: WorkoutInput[] | null | undefined): Map<MuscleId, MuscleRecovery> {
  return useMemo(() => {
    if (!workouts) return new Map<MuscleId, MuscleRecovery>();
    return computeRecovery(
      workouts.map((w) => ({
        date: w.date,
        exercises: w.exercises?.map((ex) => ({ name: ex.name })) ?? null,
      })),
    );
  }, [workouts]);
}
