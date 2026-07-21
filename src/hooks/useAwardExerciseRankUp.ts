import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RankKey } from "@/lib/fitness/exerciseRanks";

/**
 * Déclare une montée de Rang par exercice au Reward Engine. Le serveur ne
 * revalide PAS la classification (Titre) — il exige la preuve qu'une
 * amélioration réelle a eu lieu (nouveau meilleur 1RM estimé sur cet
 * exercice) avant de verser quoi que ce soit ; sinon la réclamation est
 * silencieusement ignorée (voir `award_exercise_rank_up`, migration
 * `20260721120000`).
 */
export function useAwardExerciseRankUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      titreKey,
      exerciseName,
      exerciseReferenceId,
      workoutId,
    }: {
      titreKey: RankKey;
      exerciseName: string;
      exerciseReferenceId?: string | null;
      workoutId?: string | null;
    }) => {
      const { error } = await (supabase as any).rpc("award_exercise_rank_up", {
        _titre_key: titreKey,
        _exercise_reference_id: exerciseReferenceId ?? null,
        _exercise_name: exerciseName,
        _workout_id: workoutId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user_stats"] });
    },
  });
}
