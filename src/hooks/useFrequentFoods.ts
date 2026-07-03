import { useQuery } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import type { FoodSuggestion } from "@/services/foodSuggestion";

/**
 * Aliments les plus consommés sur les 30 derniers jours.
 * Agrégation côté SQL via la RPC `frequent_foods` (remplace le chargement de
 * 300 lignes + agrégation client — perf P3 de l'audit nutrition).
 */
export function useFrequentFoods(limit = 6) {
  return useQuery({
    queryKey: ["frequent_foods", limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const { data, error } = await supabase.rpc("frequent_foods", {
        p_days: 30,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: `freq:${r.name.toLowerCase().trim()}`,
        name: r.name,
        calories: r.calories,
        proteins: r.proteins,
        carbs: r.carbs,
        fats: r.fats,
        source: "custom" as const,
        // Astuce : le nombre d'utilisations est stocké dans quality_score pour
        // que l'affichage puisse l'exploiter sans changer l'interface.
        quality_score: Number(r.cnt),
      }));
    },
  });
}
