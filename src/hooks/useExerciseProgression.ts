import { useMemo } from "react";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import {
  computeExerciseProgression,
  nextObjectives,
  type ExerciseProgression,
} from "@/lib/fitness/exerciseXp";
import { rankFromXp, type RankState } from "@/lib/fitness/exerciseRanks";

export interface ExerciseProgressionSnapshot {
  isLoading: boolean;
  progression: ExerciseProgression | null;
  rank: RankState;
  objectives: string[];
  sessionCount: number;
}

export function useExerciseProgression(
  exerciseName: string | null | undefined,
): ExerciseProgressionSnapshot {
  const { data, isLoading } = useExerciseSetHistory(exerciseName);

  return useMemo(() => {
    const sessions = (data ?? []).map((s) => ({
      workoutId: s.workoutId,
      date: s.date,
      sets: s.sets.map((x) => ({ reps: x.reps, weight: x.weight })),
    }));
    const progression = exerciseName
      ? computeExerciseProgression(exerciseName, sessions)
      : null;
    const rank = rankFromXp(progression?.totalXp ?? 0);
    const objectives = exerciseName && progression
      ? nextObjectives(exerciseName, progression.best, rank.xpToNext)
      : [];
    return {
      isLoading,
      progression,
      rank,
      objectives,
      sessionCount: sessions.length,
    };
  }, [data, isLoading, exerciseName]);
}
