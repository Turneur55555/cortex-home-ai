// ============================================================
// Bilan IA post-clôture — MUSCULATION. Phase C, lot V2 : le rendu
// (coquille + sections) est extrait dans WorkoutAnalysisContent.tsx pour
// être partagé avec le bilan générique et la relecture depuis les
// Chroniques — le comportement de CE sheet (payload, appel Edge,
// déclenchement à la clôture) est strictement inchangé. La fonction Edge
// persiste déjà chaque bilan dans `workout_analyses` : l'invalidation de
// l'index ci-dessous rend le bilan immédiatement re-ouvrable depuis la
// carte de la séance dans les Chroniques (voir useWorkoutAnalyses.ts).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveWorkout } from "@/hooks/use-fitness";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { WORKOUT_ANALYSES_QUERY_ROOT } from "@/hooks/useWorkoutAnalyses";
import {
  AnalysisSheetShell,
  WorkoutAnalysisContent,
  type WorkoutAnalysis,
} from "./WorkoutAnalysisContent";

interface Props {
  workout: ActiveWorkout;
  workoutId: string;
  previousWorkouts?: Array<{
    date: string;
    name: string;
    exercises?: Array<{ name: string; weight: number | null; reps: number | null }> | null;
  }>;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
  onClose: () => void;
}

export function PostWorkoutAnalysisSheet({
  workout,
  workoutId,
  previousWorkouts = [],
  recoveryMap,
  onClose,
}: Props) {
  const [analysis, setAnalysis] = useState<WorkoutAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      try {
        // Build recovery map payload
        const recoveryPayload: Record<string, { status: string; hoursRemaining: number | null }> =
          {};
        if (recoveryMap) {
          for (const [id, rec] of recoveryMap.entries()) {
            recoveryPayload[id] = { status: rec.status, hoursRemaining: rec.hoursRemaining };
          }
        }

        // Build exercise summaries with muscle groups
        const exercises = (workout.exercises ?? []).map((ex) => {
          const muscles = exerciseToMuscles(ex.name);
          return {
            name: ex.name,
            muscles,
            sets: (ex.exercise_sets ?? []).map((s) => ({
              reps: s.reps,
              weight: s.weight,
              completed: s.completed,
            })),
          };
        });

        const durationMin = Math.max(
          1,
          Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
        );

        const { data, error: fnErr } = await supabase.functions.invoke("analyze-workout", {
          body: {
            workout_id: workoutId,
            workout: {
              name: workout.name,
              duration_minutes: durationMin,
              exercises,
            },
            history: previousWorkouts.slice(0, 8).map((w) => ({
              date: w.date,
              name: w.name,
              exercises: (w.exercises ?? []).map((ex) => ({
                name: ex.name,
                weight: ex.weight,
                reps: ex.reps,
              })),
            })),
            recovery_map: recoveryPayload,
          },
        });

        if (fnErr) throw new Error(fnErr.message);
        setAnalysis(data as WorkoutAnalysis);
        // Le bilan vient d'être persisté côté Edge — l'index des bilans
        // (menu "Revoir le bilan" des Chroniques) doit le voir sans reload.
        queryClient.invalidateQueries({ queryKey: WORKOUT_ANALYSES_QUERY_ROOT });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'analyse");
      } finally {
        setLoading(false);
      }
    })();
  }, [workout, workoutId, previousWorkouts, recoveryMap, queryClient]);

  return (
    <AnalysisSheetShell
      title="Analyse IA"
      subtitle={workout.name}
      loading={loading}
      loadingHint="L'IA analyse tes performances"
      error={error}
      onClose={onClose}
    >
      {analysis && (
        <WorkoutAnalysisContent analysis={analysis} variant="muscu" onClose={onClose} />
      )}
    </AnalysisSheetShell>
  );
}
