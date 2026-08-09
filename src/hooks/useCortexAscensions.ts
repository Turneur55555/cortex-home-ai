import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { CortexAscensionRow } from "@/lib/fitness/rpg/ascension";

/**
 * Historique des Ascensions (nouveau moteur, changements de Titre pilotés
 * par la Puissance Cortex — jamais l'XP). Écrit uniquement par la fonction
 * serveur `record_cortex_ascension` (voir `useAscensionSync`), jamais par
 * le client directement.
 */
export function useCortexAscensions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cortex_ascensions", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<CortexAscensionRow[]> => {
      const { data, error } = await (supabase as any)
        .from("cortex_ascensions")
        .select("tier_index, previous_tier_index, created_at")
        .eq("user_id", user!.id)
        .order("tier_index", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CortexAscensionRow[];
    },
  });
}
