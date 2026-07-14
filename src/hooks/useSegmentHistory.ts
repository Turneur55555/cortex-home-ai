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
//
// Phase 3, Étape 4 — bascule lecture par exercise_id : `workout_segments`
// porte une colonne `exercise_id` (renseignée par ExerciseResolutionService
// depuis l'Étape 2, backfillée à l'Étape 3). La sélection du "type de
// segment" demandé se fait désormais PRIORITAIREMENT par cet id — même
// principe que useExerciseSetHistory.ts (selectInstancesForExercise) :
// parmi les occurrences dont le libellé correspond (via segmentTypeKey),
// si elles pointent toutes vers un seul exercise_id, c'est CET id qui fait
// foi pour le filtrage final. Filet de compatibilité par libellé si aucune
// occurrence liée n'existe encore, ou si une incohérence est détectée
// (journalisée en console pour investigation) — aucune rupture tant que le
// backfill/la résolution n'ont pas 100% couvert les données.
// ============================================================

/** Toutes les occurrences de segments Course de l'utilisateur (toutes
 *  séances terminées confondues), mises en cache une seule fois par
 *  utilisateur — plusieurs fiches segment ouvertes successivement
 *  partagent ce fetch au lieu de le relancer par type. */
export function useUserCourseSegmentInstances(userId: string | undefined) {
  return useQuery({
    queryKey: ["fitness", "course_segment_instances_raw", userId],
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
        .select("workout_id, label, metrics, completed, exercise_id")
        .in("workout_id", ids);
      if (e2) throw e2;

      return (segments ?? []).map((s) => ({
        workoutId: s.workout_id,
        date: dateByWorkout.get(s.workout_id) ?? "",
        label: s.label,
        metrics: (s.metrics ?? {}) as Record<string, number | string>,
        completed: s.completed,
        exerciseId: s.exercise_id,
      }));
    },
  });
}

/**
 * Sélectionne les occurrences appartenant au type de segment demandé.
 *
 * Priorité à `exerciseId` : parmi les occurrences dont le libellé
 * correspond (via segmentTypeKey), si elles pointent toutes vers un seul
 * exercise_id, c'est CET id qui fait foi pour le filtrage final (capture
 * ainsi toute occurrence liée à la même référence même si son libellé brut
 * diffère — ex. suffixe de répétition différent).
 *
 * Filet de compatibilité : si aucune occurrence liée par libellé n'a
 * d'exercise_id (colonne encore NULL — ne devrait plus arriver après le
 * backfill de l'Étape 3, mais on ne suppose jamais une couverture 100%
 * garantie en toute circonstance) ou si plusieurs exercise_id distincts
 * coexistent pour le même type de segment (incohérence de données,
 * signalée en console), on retombe sur l'ancien comportement (comparaison
 * par segmentTypeKey), pour ne jamais faire disparaître des données
 * réelles pendant la transition.
 */
function selectInstancesForSegmentType(
  instances: SegmentInstance[],
  key: string,
): SegmentInstance[] {
  const byLabel = instances.filter((i) => segmentTypeKey(i.label) === key);
  if (byLabel.length === 0) return [];

  const ids = new Set(byLabel.map((i) => i.exerciseId).filter((id): id is string => !!id));

  if (ids.size === 1) {
    const [exerciseId] = ids;
    return instances.filter((i) => i.exerciseId === exerciseId);
  }

  if (ids.size > 1) {
    console.error(
      "[useSegmentHistory] Incohérence : plusieurs exercise_id distincts pour le même type de segment, repli sur la comparaison par libellé.",
      { key, ids: Array.from(ids) },
    );
  }

  // ids.size === 0 (aucune occurrence encore liée) ou > 1 (incohérence) :
  // filet de compatibilité, comportement identique à avant l'Étape 4.
  return byLabel;
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
    queryKey: ["fitness", "segment_history", key, user?.id],
    enabled: key.length > 0 && !!user && !!instances.data,
    queryFn: async (): Promise<SegmentInstance[]> => {
      return selectInstancesForSegmentType(instances.data ?? [], key);
    },
  });
}
