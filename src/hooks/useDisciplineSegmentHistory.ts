import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { segmentTypeKey, type SegmentInstance } from "@/lib/fitness/segmentStats";

// ============================================================
// SOLUTION TRANSITOIRE — Phase 1 multi-discipline (2026-07-11).
//
// Pendant de useSegmentHistory.ts (Course à pied), mais pour les
// disciplines qui n'écrivent PAS dans `workout_segments` (Cardio/HYROX/
// Guided aujourd'hui — voir types.ts, feedsRankEngine/supportsLiveTracking).
// Ces disciplines n'ont pas besoin d'édition live ; leur contenu est déjà
// entièrement sauvegardé dans `workouts.metadata.segments` à la clôture
// de la séance (voir sessionViewHelpers.segmentsFromMetadata). Ce hook
// relit CETTE donnée déjà existante et la reformate en `SegmentInstance[]`
// — même contrat que useSegmentHistory — pour pouvoir réutiliser TEL QUEL
// `computeSegmentStats`/`groupByExerciseLabel` (segmentStats.ts) : un seul
// moteur de calcul d'historique/stats/progression pour toutes les
// disciplines, seule la source de lecture diffère.
//
// Pourquoi transitoire et pas définitif : `metadata.segments` ne porte
// les valeurs numériques (`metrics`) que depuis l'ajout de ce champ sur
// SessionSegment (Phase 1) — les séances plus anciennes n'en ont pas et
// seront simplement ignorées pour le calcul de stats (jamais de donnée
// fictive). Nathan a explicitement demandé que ce mécanisme à deux
// modèles de stockage (workout_segments pour Course, metadata.segments
// pour les autres) soit réévalué en Phase 2 avant toute généralisation —
// voir le rapport de fin de Phase 1. Si `workout_segments` devient un
// jour le modèle unique, ce hook disparaît au profit de useSegmentHistory
// généralisé, sans changement pour les composants qui les consomment
// (SegmentAnalysisSheet ne connaît que `SegmentInstance[]`).
//
// Toutes les instances d'un segment sont considérées "completed=true" :
// contrairement à Course (segments live, potentiellement non cochés), une
// séance Cardio/HYROX/Guided sauvegardée est une description complète et
// atomique de ce qui a été fait — pas de notion de segment "en attente".
// ============================================================

interface StoredSegment {
  label: string;
  metrics?: Record<string, number>;
}

function useUserDisciplineSegmentInstances(discipline: DisciplineId, userId: string | undefined) {
  return useQuery({
    queryKey: ["discipline_segment_instances_raw", discipline, userId],
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
          });
        }
      }
      return instances;
    },
  });
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
    queryKey: ["discipline_segment_history", discipline, key, user?.id],
    enabled: key.length > 0 && !!user && !!instances.data,
    queryFn: async (): Promise<SegmentInstance[]> => {
      return (instances.data ?? []).filter((i) => segmentTypeKey(i.label) === key);
    },
  });
}

export { useUserDisciplineSegmentInstances };
