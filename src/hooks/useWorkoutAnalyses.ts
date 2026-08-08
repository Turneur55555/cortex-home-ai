import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import type { WorkoutAnalysis } from "@/components/fitness/WorkoutAnalysisContent";

// ============================================================
// Lecture des bilans IA persistés — Phase C, lot V2 (§8.2 du doc de
// phase). La table `workout_analyses` est écrite par la fonction Edge
// `analyze-workout` depuis le 29/06 (un bilan par séance, UNIQUE
// workout_id, RLS propriétaire) — nécessite le réseau (appel IA), reste
// online-only en ÉCRITURE. La LECTURE, elle, est offline-first (CLAUDE.md,
// vague Cœur Fitness) : même pattern lecture-hydrate-fallback-local que
// `useRecipes()` — un bilan déjà consulté une fois en ligne reste
// consultable hors connexion depuis les Chroniques.
// ============================================================

export const WORKOUT_ANALYSES_QUERY_ROOT = ["fitness", "workout_analyses"] as const;

export interface WorkoutAnalysisRow {
  id: string;
  user_id: string;
  workout_id: string;
  summary: WorkoutAnalysis;
  created_at: string;
  updated_at: string;
}

export const workoutAnalysesRepo = createOfflineRepository<WorkoutAnalysisRow>("workout_analyses");

async function refreshFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  try {
    const { data, error } = await db
      .from("workout_analyses")
      .select("*")
      .eq("user_id", userId);
    if (!error && data) {
      await hydrateEntitiesFromServer(
        "workout_analyses",
        userId,
        data as unknown as WorkoutAnalysisRow[],
      );
    }
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

/** Ensemble des workout_id qui possèdent un bilan persisté — UNE requête
 *  légère (ids seuls) partagée par toutes les cartes de l'historique,
 *  pour ne montrer "Revoir le bilan" que là où un bilan existe (jamais
 *  d'entrée de menu morte). */
export function useWorkoutAnalysisIndex() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: [...WORKOUT_ANALYSES_QUERY_ROOT, "index", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      if (!userId) return new Set();
      await refreshFromServer(userId);
      const local = await workoutAnalysesRepo.list(userId);
      return new Set(local.map((row) => row.workout_id));
    },
  });
}

/** Bilan complet d'UNE séance (null si aucun bilan persisté). Chargé
 *  uniquement à l'ouverture de la relecture — jamais en masse. */
export function useStoredWorkoutAnalysis(workoutId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: [...WORKOUT_ANALYSES_QUERY_ROOT, "detail", workoutId, userId],
    enabled: !!userId && !!workoutId,
    queryFn: async (): Promise<WorkoutAnalysis | null> => {
      if (!userId || !workoutId) return null;
      await refreshFromServer(userId);
      const local = await workoutAnalysesRepo.list(userId);
      const match = local.find((row) => row.workout_id === workoutId);
      return match?.summary ?? null;
    },
  });
}
