import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Déclenche la vérification serveur d'une montée de Rang par exercice.
 * Le client n'envoie plus AUCUNE valeur calculée (ni Titre, ni palier, ni
 * 1RM) — seulement l'identité de l'exercice. L'Edge Function
 * `verify-exercise-rank` recalcule ENTIÈREMENT le Rang depuis les données
 * brutes (même moteur que le client, copie fidèle testée en parité) et
 * décide seule si un `exercise_rank_up` est versé. Voir migration
 * `20260721130000` et `supabase/functions/verify-exercise-rank/`.
 */
export function useAwardExerciseRankUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      exerciseName,
      exerciseReferenceId,
    }: {
      exerciseName: string;
      exerciseReferenceId?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("verify-exercise-rank", {
        body: {
          exercise_name: exerciseName,
          exercise_reference_id: exerciseReferenceId ?? null,
        },
      });
      if (error) throw error;
      return data as { tierIndex: number; titre: string; granted: string[] };
    },
    onSuccess: (data) => {
      if (data?.granted?.length) {
        void queryClient.invalidateQueries({ queryKey: ["user_stats"] });
      }
    },
  });
}
