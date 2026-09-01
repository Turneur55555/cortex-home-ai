import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildPromotionEvents, type PromotionEvent } from "@/lib/fitness/rpg/promotionHistory";
import { SERVER_CONFIRMED_QUERY_OPTIONS } from "@/lib/offline/serverConfirmedQuery";

/**
 * Historique persistant des promotions (Rang/Grade), écrit automatiquement
 * en base par le trigger `record_rank_promotions` à chaque franchissement
 * de palier — aucune saisie manuelle, aucun calcul côté client.
 */
export function useRankPromotions() {
  const { user } = useAuth();

  return useQuery({
    // CHANTIER 4 (MAJ-08) : écrit par le trigger `record_rank_promotions` à
    // l'arrivée de l'XP — donc à rafraîchir après un passage de sync réussi.
    ...SERVER_CONFIRMED_QUERY_OPTIONS,
    queryKey: ["rank_promotions", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<PromotionEvent[]> => {
      const { data, error } = await (supabase as any)
        .from("rank_promotions")
        .select("tier_index, xp_at_promotion, created_at")
        .eq("user_id", user!.id)
        .order("tier_index", { ascending: false });
      if (error) throw error;
      return buildPromotionEvents((data ?? []) as any);
    },
  });
}
