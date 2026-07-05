import { useMemo } from "react";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
import { useGoals } from "@/hooks/useGoalsWithProgress";
import { useTrainingObjective } from "@/hooks/useTrainingObjective";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { analyzeExercise, type ExerciseAnalysis } from "@/lib/fitness/analysis";

export interface ExerciseAnalysisResult {
  isLoading: boolean;
  analysis: ExerciseAnalysis | null;
  sessionCount: number;
}

/**
 * Assemble la fiche d'analyse complète d'un exercice à partir des données déjà
 * chargées par l'app (historique de séries, carte de récupération, mensurations,
 * objectifs). Tout est mémoïsé : le moteur pur ne recalcule que si une entrée
 * change, et aucune requête supplémentaire n'est déclenchée (réutilise les
 * caches react-query existants ["workouts"], ["body_tracking"], ["goals"]).
 */
export function useExerciseAnalysis(
  exerciseName: string | null | undefined,
): ExerciseAnalysisResult {
  const { data: history, isLoading: histLoading } = useExerciseSetHistory(exerciseName);
  const { data: workouts, isLoading: wkLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(workouts as any);
  const { data: body } = useBodyMeasurements();
  const { data: goals } = useGoals();
  const { objective: explicitObjective } = useTrainingObjective();

  const recoveryArray = useMemo(
    () =>
      Array.from(recoveryMap.values()).map((m) => ({
        id: m.id,
        status: m.status,
        hoursSinceLast: m.hoursSinceLast,
        hoursRemaining: m.hoursRemaining,
      })),
    [recoveryMap],
  );

  // Muscles résolus par l'IA pour cet exercice (repli exercices personnalisés).
  const aiMuscleGroups = useMemo(() => {
    if (!exerciseName || !workouts) return null;
    const target = normalize(exerciseName);
    for (const w of workouts as any[]) {
      for (const ex of w.exercises ?? []) {
        if (normalize(ex.name) === target && Array.isArray(ex.muscle_groups) && ex.muscle_groups.length) {
          return ex.muscle_groups as string[];
        }
      }
    }
    return null;
  }, [exerciseName, workouts]);

  const analysis = useMemo(() => {
    if (!exerciseName) return null;
    const sessions = (history ?? []).map((s) => ({
      date: s.date,
      sets: s.sets.map((x) => ({ reps: x.reps, weight: x.weight })),
    }));
    return analyzeExercise({
      exerciseName,
      sessions,
      aiMuscleGroups,
      recovery: recoveryArray,
      profile: {
        explicitObjective: explicitObjective ?? null,
        body: (body ?? []) as any,
        goals: (goals ?? []) as any,
      },
    });
  }, [exerciseName, history, aiMuscleGroups, recoveryArray, explicitObjective, body, goals]);

  return {
    isLoading: histLoading || wkLoading,
    analysis,
    sessionCount: history?.length ?? 0,
  };
}
