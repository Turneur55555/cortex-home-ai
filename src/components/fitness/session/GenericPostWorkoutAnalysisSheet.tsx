// ============================================================
// Bilan IA post-clôture — disciplines GÉNÉRIQUES (Course, Cardio, HYROX,
// Guidé, Autre). Phase C, lot V2 (P0-2) : pendant du
// PostWorkoutAnalysisSheet musculation — même déclenchement (à la
// clôture), même coquille, mêmes sections (WorkoutAnalysisContent), même
// fonction Edge `analyze-workout` (branche additive `generic_workout`,
// même persistance dans `workout_analyses` → le bilan est immédiatement
// re-ouvrable depuis les Chroniques). Seul le PAYLOAD parle le
// vocabulaire de la discipline : exercices/répétitions/meilleures
// valeurs par métrique déclarée (SEGMENT_METRIC_CONFIG), jamais de
// muscles/tonnage/1RM — équivalence, pas copie (§1.3 du doc de phase).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { ActiveGenericWorkout } from "@/hooks/useGenericActiveSession";
import { useUserDisciplineSegmentInstances } from "@/hooks/useDisciplineSegmentHistory";
import { WORKOUT_ANALYSES_QUERY_ROOT } from "@/hooks/useWorkoutAnalyses";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  bestMetricValue,
  groupByExerciseLabel,
  segmentTypeKey,
  SEGMENT_METRIC_CONFIG,
} from "@/lib/fitness/segmentStats";
import {
  AnalysisSheetShell,
  WorkoutAnalysisContent,
  type WorkoutAnalysis,
} from "../WorkoutAnalysisContent";

/** Meilleures valeurs formatées d'un lot d'occurrences, une entrée par
 *  métrique déclarée présente — le vocabulaire vient intégralement de
 *  SEGMENT_METRIC_CONFIG, jamais d'une discipline codée en dur. */
function bestsFor(
  instances: Array<{ metrics?: Record<string, number | string> }>,
): Array<{ metric: string; value: string }> {
  const keys = new Set<string>();
  for (const inst of instances) {
    for (const key of Object.keys(inst.metrics ?? {})) {
      if (SEGMENT_METRIC_CONFIG[key]) keys.add(key);
    }
  }
  return Array.from(keys)
    .sort((a, b) => SEGMENT_METRIC_CONFIG[a].order - SEGMENT_METRIC_CONFIG[b].order)
    .map((key) => {
      const best = bestMetricValue(instances, key);
      return best ? { metric: SEGMENT_METRIC_CONFIG[key].label, value: best.formatted } : null;
    })
    .filter((b): b is { metric: string; value: string } => b !== null);
}

export function GenericPostWorkoutAnalysisSheet({
  workout,
  onClose,
}: {
  workout: ActiveGenericWorkout;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<WorkoutAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Historique de la discipline (occurrences des séances passées, déjà en
  // cache pour le badge Record / la fiche exercice — aucune requête
  // nouvelle par rapport à ce que l'écran de séance chargeait déjà).
  const { data: pastInstances } = useUserDisciplineSegmentInstances(workout.discipline, user?.id);

  const payload = useMemo(() => {
    const entry = ENGINE_REGISTRY[workout.discipline];
    const groups = groupByExerciseLabel(workout.segments);
    const durationMin = Math.max(
      1,
      Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
    );

    const exercises = groups.slice(0, 20).map((g) => ({
      label: g.displayLabel,
      repetitions: g.instances.length,
      completed: g.instances.filter((s) => s.completed).length,
      bests: bestsFor(g.instances).slice(0, 6),
      previous_best:
        bestsFor((pastInstances ?? []).filter((p) => segmentTypeKey(p.label) === g.key)).slice(
          0,
          3,
        ) ?? [],
    }));

    // Résumé des séances passées de la même discipline (8 dernières) —
    // pour que l'IA situe la séance dans une trajectoire, comme le fait
    // le payload musculation avec `history`.
    const byWorkout = new Map<string, { date: string; labels: Set<string> }>();
    for (const inst of pastInstances ?? []) {
      const existing = byWorkout.get(inst.workoutId);
      if (existing) existing.labels.add(inst.label);
      else byWorkout.set(inst.workoutId, { date: inst.date, labels: new Set([inst.label]) });
    }
    const history = Array.from(byWorkout.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((h) => ({ date: h.date, exercises: Array.from(h.labels).slice(0, 10) }));

    return {
      workout_id: workout.id,
      generic_workout: {
        name: workout.name,
        discipline: workout.discipline,
        discipline_label: entry?.label ?? workout.discipline,
        duration_minutes: durationMin,
        exercises,
      },
      history,
    };
    // `workout` est un snapshot figé à la clôture — stable par construction.
  }, [workout, pastInstances]);

  useEffect(() => {
    if (calledRef.current) return;
    // L'historique alimente la qualité du bilan : on attend sa 1re
    // résolution (cache 30s, quasi immédiat) avant l'appel unique.
    if (pastInstances === undefined) return;
    calledRef.current = true;

    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("analyze-workout", {
          body: payload,
        });
        if (fnErr) throw new Error(fnErr.message);
        setAnalysis(data as WorkoutAnalysis);
        queryClient.invalidateQueries({ queryKey: WORKOUT_ANALYSES_QUERY_ROOT });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'analyse");
      } finally {
        setLoading(false);
      }
    })();
  }, [pastInstances, payload, queryClient]);

  return (
    <AnalysisSheetShell
      title="Analyse IA"
      subtitle={workout.name}
      loading={loading}
      loadingHint="L'IA analyse ta séance"
      error={error}
      onClose={onClose}
    >
      {analysis && (
        <WorkoutAnalysisContent analysis={analysis} variant="generic" onClose={onClose} />
      )}
    </AnalysisSheetShell>
  );
}
