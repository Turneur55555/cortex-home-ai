import { useMemo } from "react";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
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
 * caches react-query existants ["workouts"], ["body_tracking"]).
 */
export function useExerciseAnalysis(
  exerciseName: string | null | undefined,
): ExerciseAnalysisResult {
  const { data: history, isLoading: histLoading } = useExerciseSetHistory(exerciseName);
  const { data: workouts, isLoading: wkLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(workouts as any);
  const { data: body } = useBodyMeasurements();
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
  //
  // Étape 4.5 (2026-07-12) — bascule identité, même schéma que
  // `selectInstancesForExercise` (useExerciseSetHistory.ts) : parmi les
  // occurrences dont le nom normalisé correspond, si elles partagent toutes
  // un seul `exercise_reference_id`, on élargit la recherche à TOUTES les
  // occurrences liées à cet id (pas seulement celles qui correspondent
  // encore au nom exact) — un exercice renommé/reformulé retrouve donc les
  // muscle_groups déjà analysés sous une autre variante du libellé. Filet
  // de compatibilité : si aucune occurrence liée n'a de référence, ou si
  // plusieurs références distinctes coexistent (incohérence, journalisée),
  // repli sur la comparaison par nom normalisé — comportement identique à
  // avant cette étape.
  const aiMuscleGroups = useMemo(() => {
    if (!exerciseName || !workouts) return null;
    const target = normalize(exerciseName);
    const allExercises = (workouts as any[]).flatMap((w) => w.exercises ?? []);
    const byName = allExercises.filter((ex) => normalize(ex.name) === target);
    if (byName.length === 0) return null;

    const refIds = new Set(
      byName.map((ex) => ex.exercise_reference_id).filter((id): id is string => !!id),
    );

    let candidates = byName;
    if (refIds.size === 1) {
      const [refId] = refIds;
      candidates = allExercises.filter((ex) => ex.exercise_reference_id === refId);
    } else if (refIds.size > 1) {
      console.error(
        "[useExerciseAnalysis] Incohérence : plusieurs exercise_reference_id distincts pour le même nom normalisé, repli sur la comparaison par nom.",
        { exerciseName, refIds: Array.from(refIds) },
      );
    }

    for (const ex of candidates) {
      if (Array.isArray(ex.muscle_groups) && ex.muscle_groups.length) {
        return ex.muscle_groups as string[];
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
      },
    });
  }, [exerciseName, history, aiMuscleGroups, recoveryArray, explicitObjective, body]);

  return {
    isLoading: histLoading || wkLoading,
    analysis,
    sessionCount: history?.length ?? 0,
  };
}
