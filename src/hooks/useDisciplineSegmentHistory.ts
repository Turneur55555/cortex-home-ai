import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { segmentTypeKey, type SegmentInstance } from "@/lib/fitness/segmentStats";

// ============================================================
// Pendant de useSegmentHistory.ts (Course à pied), mais pour les
// disciplines qui n'écrivent PAS dans `workout_segments` (Cardio/HYROX/
// Guided/Autre — voir types.ts, feedsRankEngine/supportsLiveTracking).
// Ces disciplines n'ont pas besoin d'édition live ; leur contenu est déjà
// entièrement sauvegardé dans `workouts.metadata.segments` à la clôture
// de la séance (voir sessionViewHelpers.segmentsFromMetadata). Ce hook
// relit CETTE donnée déjà existante et la reformate en `SegmentInstance[]`
// — même contrat que useSegmentHistory — pour pouvoir réutiliser TEL QUEL
// `computeSegmentStats`/`groupByExerciseLabel` (segmentStats.ts) : un seul
// moteur de calcul d'historique/stats/progression pour toutes les
// disciplines, seule la source de lecture diffère.
//
// Phase 3, Étape 4 (suite, 2026-07-12) — bascule lecture par exercise_id :
// depuis la centralisation de la résolution dans `useAddWorkout` (voir
// SessionSegment.exerciseId, types.ts), les segments nouvellement
// sauvegardés portent un `exerciseId`. Même principe que
// useExerciseSetHistory.ts/useSegmentHistory.ts : priorité à cet id pour
// déterminer les occurrences d'un même type de segment, filet de
// compatibilité par libellé (`segmentTypeKey`) pour les séances
// enregistrées AVANT ce câblage (aucune régression, aucune donnée
// perdue tant que le backfill historique n'est pas passé).
//
// `metadata.segments` ne porte les valeurs numériques (`metrics`) que
// depuis l'ajout de ce champ sur SessionSegment (Phase 1) — les séances
// plus anciennes n'en ont pas et seront simplement ignorées pour le
// calcul de stats (jamais de donnée fictive).
//
// Toutes les instances d'un segment sont considérées "completed=true" :
// contrairement à Course (segments live, potentiellement non cochés), une
// séance Cardio/HYROX/Guided/Autre sauvegardée est une description
// complète et atomique de ce qui a été fait — pas de notion de segment
// "en attente".
// ============================================================

interface StoredSegment {
  label: string;
  metrics?: Record<string, number>;
  exerciseId?: string | null;
}

function useUserDisciplineSegmentInstances(discipline: DisciplineId, userId: string | undefined) {
  return useQuery({
    queryKey: ["fitness", "discipline_segment_instances_raw", discipline, userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<SegmentInstance[]> => {
      const { data: workouts, error } = await supabase
        .from("workouts")
        .select("id, date, metadata")
        .eq("user_id", userId!)
        .eq("discipline", discipline)
        .eq("status", "completed");
      if (error) throw error;

      const instances: SegmentInstance[] = [];
      for (const w of workouts ?? []) {
        const raw = (w.metadata as { segments?: unknown } | null)?.segments;
        if (!Array.isArray(raw)) continue;
        for (const seg of raw as StoredSegment[]) {
          if (!seg?.label || !seg.metrics) continue; // pas de métriques numériques → rien à agréger
          instances.push({
            workoutId: w.id,
            date: w.date,
            label: seg.label,
            metrics: seg.metrics,
            completed: true,
            exerciseId: seg.exerciseId ?? null,
          });
        }
      }
      return instances;
    },
  });
}

/**
 * Sélectionne les occurrences appartenant au type de segment demandé.
 * Priorité à `exerciseId` (même logique que
 * useSegmentHistory.selectInstancesForSegmentType) : parmi les occurrences
 * dont le libellé correspond (via segmentTypeKey), si elles pointent
 * toutes vers un seul exerciseId, c'est CET id qui fait foi. Filet de
 * compatibilité par libellé si aucune occurrence liée n'a d'id, ou si
 * plusieurs id distincts coexistent (incohérence, journalisée).
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
      "[useDisciplineSegmentHistory] Incohérence : plusieurs exercise_id distincts pour le même type de segment, repli sur la comparaison par libellé.",
      { key, ids: Array.from(ids) },
    );
  }

  return byLabel;
}

/** Historique de toutes les occurrences d'un type de segment pour UNE
 *  discipline donnée (identifié par son libellé de base via
 *  segmentTypeKey), toutes séances terminées confondues. */
export function useDisciplineSegmentHistory(
  discipline: DisciplineId,
  rawLabel: string | null | undefined,
) {
  const { user } = useAuth();
  const key = rawLabel ? segmentTypeKey(rawLabel) : "";
  const instances = useUserDisciplineSegmentInstances(discipline, user?.id);

  return useQuery({
    queryKey: ["fitness", "discipline_segment_history", discipline, key, user?.id],
    enabled: key.length > 0 && !!user && !!instances.data,
    queryFn: async (): Promise<SegmentInstance[]> => {
      return selectInstancesForSegmentType(instances.data ?? [], key);
    },
  });
}

export { useUserDisciplineSegmentInstances };
