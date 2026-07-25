import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildPromotionEvents, type PromotionEvent } from "@/lib/fitness/rpg/promotionHistory";

/**
 * Historique persistant des promotions (Rang/Grade), écrit automatiquement
 * en base par le trigger `record_rank_promotions` à chaque franchissement
 * de palier — aucune saisie manuelle, aucun calcul côté client.
 */
export function useRankPromotions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["rank_promotions", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<PromotionEvent[]> => {
      const { data, error } = await supabase
        .from("rank_promotions")
        .select("tier_index, xp_at_promotion, created_at")
        .eq("user_id", user!.id)
        .order("tier_index", { ascending: false });
      if (error) throw error;
      return buildPromotionEvents(data ?? []);
    },
  });
}
