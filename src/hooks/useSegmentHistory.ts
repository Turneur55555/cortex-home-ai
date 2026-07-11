import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { segmentTypeKey, type SegmentInstance } from "@/lib/fitness/segmentStats";

// ============================================================
// Historique de toutes les occurrences d'un TYPE de segment Course à pied
// (ex. "400m allure 5 km"), toutes séances TERMINÉES confondues — pendant
// générique de useExerciseSetHistory.ts côté musculation (même
// architecture : un fetch large mis en cache une seule fois par
// utilisateur, puis filtré côté client par identité). Alimente
// SegmentAnalysisSheet (fiche détaillée d'un segment, ouverte depuis
// l'historique des séances Course — voir CourseHistoryContent.tsx).
//
// Ne lit QUE les séances discipline="course" avec status="completed" :
// n'affecte ni la séance active générique (useGenericActiveSession.ts),
// ni aucune autre discipline, ni le module musculation. `workout_segments`
// n'est JAMAIS écrit ici (lecture seule) — frontière feedsRankEngine
// inchangée (voir migration 20260709220000_generic_workout_segments.sql).
// ============================================================

/** Toutes les occurrences de segments Course de l'utilisateur (toutes
 *  séances terminées confondues), mises en cache une seule fois par
 *  utilisateur — plusieurs fiches segment ouvertes successivement
 *  partagent ce fetch au lieu de le relancer par type. */
export function useUserCourseSegmentInstances(userId: string | undefined) {
  return useQuery({
    queryKey: ["course_segment_instances_raw", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<SegmentInstance[]> => {
      const { data: workouts, error: e1 } = await supabase
        .from("workouts")
        .select("id, date")
        .eq("user_id", userId!)
        .eq("discipline", "course")
        .eq("status", "completed");
      if (e1) throw e1;

      const ids = (workouts ?? []).map((w) => w.id);
      if (ids.length === 0) return [];
      const dateByWorkout = new Map((workouts ?? []).map((w) => [w.id, w.date]));

      const { data: segments, error: e2 } = await supabase
        .from("workout_segments")
        .select("workout_id, label, metrics, completed")
        .in("workout_id", ids);
      if (e2) throw e2;

      return (segments ?? []).map((s) => ({
        workoutId: s.workout_id,
        date: dateByWorkout.get(s.workout_id) ?? "",
        label: s.label,
        metrics: (s.metrics ?? {}) as Record<string, number | string>,
        completed: s.completed,
      }));
    },
  });
}

/** Historique de toutes les occurrences d'un type de segment (identifié
 *  par son libellé de base via segmentTypeKey — insensible au suffixe de
 *  répétition "i/n" et aux accents/casse), toutes séances Course
 *  terminées confondues. */
export function useSegmentHistory(rawLabel: string | null | undefined) {
  const { user } = useAuth();
  const key = rawLabel ? segmentTypeKey(rawLabel) : "";
  const instances = useUserCourseSegmentInstances(user?.id);

  return useQuery({
    queryKey: ["segment_history", key, user?.id],
    enabled: key.length > 0 && !!user && !!instances.data,
    queryFn: async (): Promise<SegmentInstance[]> => {
      return (instances.data ?? []).filter((i) => segmentTypeKey(i.label) === key);
    },
  });
}
