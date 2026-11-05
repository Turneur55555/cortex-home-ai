import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Montant d'XP d'une source du barème serveur (`reward_catalog`), pour
 * l'ANNONCER (« +50 XP à prendre ») — jamais pour le verser : le serveur reste
 * seul juge (INVARIANTS §3.1). Hors ligne ou en erreur : `undefined`, et
 * l'écran n'affiche pas de montant plutôt qu'un chiffre deviné.
 */
export function useRewardAmount(sourceKey: string) {
  return useQuery({
    queryKey: ["reward_catalog", sourceKey],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("reward_catalog")
        .select("xp_amount")
        .eq("source_key", sourceKey)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data?.xp_amount ?? null;
    },
  });
}
