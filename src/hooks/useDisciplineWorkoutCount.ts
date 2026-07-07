import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DisciplineId } from "@/lib/fitness/engines/types";

/**
 * Compte EXACT (pas un échantillon plafonné, contrairement à useWorkouts()
 * qui limite à 60 lignes) du nombre de séances d'UNE discipline donnée.
 * Nouveau hook (n'existait pas) — n'importe quelle discipline (Guided
 * aujourd'hui, futures disciplines demain) peut s'en servir pour ses
 * propres succès à paliers sans jamais modifier useWorkouts()/useUserStats().
 */
export function useDisciplineWorkoutCount(discipline: DisciplineId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["discipline_workout_count", user?.id, discipline],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("discipline", discipline);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
