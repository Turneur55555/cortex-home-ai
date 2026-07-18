import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { WorkoutAnalysis } from "@/components/fitness/WorkoutAnalysisContent";

// ============================================================
// Lecture des bilans IA persistés — Phase C, lot V2 (§8.2 du doc de
// phase). La table `workout_analyses` est écrite par la fonction Edge
// `analyze-workout` depuis le 29/06 (un bilan par séance, UNIQUE
// workout_id, RLS propriétaire) mais n'était JAMAIS relue : le bilan
// était à usage unique, même en Musculation. Ces deux hooks le rendent
// re-ouvrable depuis les Chroniques — règle §9.2 du doc de phase
// (réutilisation avant création : aucune nouvelle donnée, aucune
// nouvelle écriture, uniquement la lecture de ce qui existe déjà).
// ============================================================

export const WORKOUT_ANALYSES_QUERY_ROOT = ["fitness", "workout_analyses"] as const;

/** Ensemble des workout_id qui possèdent un bilan persisté — UNE requête
 *  légère (ids seuls) partagée par toutes les cartes de l'historique,
 *  pour ne montrer "Revoir le bilan" que là où un bilan existe (jamais
 *  d'entrée de menu morte). */
export function useWorkoutAnalysisIndex() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...WORKOUT_ANALYSES_QUERY_ROOT, "index", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("workout_analyses")
        .select("workout_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ workout_id: string }>).map((row) => row.workout_id));

    },
  });
}

/** Bilan complet d'UNE séance (null si aucun bilan persisté). Chargé
 *  uniquement à l'ouverture de la relecture — jamais en masse. */
export function useStoredWorkoutAnalysis(workoutId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...WORKOUT_ANALYSES_QUERY_ROOT, "detail", workoutId, user?.id],
    enabled: !!user?.id && !!workoutId,
    queryFn: async (): Promise<WorkoutAnalysis | null> => {
      const { data, error } = await (supabase as any)
        .from("workout_analyses")
        .select("summary")
        .eq("workout_id", workoutId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as { summary?: unknown } | null)?.summary as unknown as WorkoutAnalysis) ?? null;

    },
  });
}
