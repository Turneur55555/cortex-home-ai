import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { LegacyPromotionRow } from "@/lib/fitness/rpg/ascension";

/**
 * Historique GELÉ des promotions de l'ère XP (`rank_promotions`) — le
 * trigger `record_rank_promotions` qui l'alimentait a été supprimé (le
 * Titre n'est plus dérivé de l'XP). Ces lignes restent lisibles telles
 * quelles ; aucune nouvelle ligne n'y sera plus jamais écrite. Le nouveau
 * système vivant est `useCortexAscensions`. Voir `mergePromotionTimeline`
 * (`lib/fitness/rpg/ascension.ts`) pour combiner les deux dans l'UI.
 */
export function useRankPromotions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["rank_promotions", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<LegacyPromotionRow[]> => {
      const { data, error } = await (supabase as any)
        .from("rank_promotions")
        .select("tier_index, xp_at_promotion, created_at")
        .eq("user_id", user!.id)
        .order("tier_index", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LegacyPromotionRow[];
    },
  });
}
