import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { FoodSuggestion } from "@/services/foodSuggestion";

/**
 * Retourne les aliments les plus consommés sur les 30 derniers jours,
 * en agrégeant les entrées nutrition par nom et en prenant les macros /100g
 * les plus récentes comme référence.
 */
export function useFrequentFoods(limit = 6) {
  return useQuery({
    queryKey: ["frequent_foods"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("nutrition")
        .select("name, base_calories, base_proteins, base_carbs, base_fats, calories, proteins, carbs, fats")
        .gte("date", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      // Agrégation côté client : fréquence par nom normalisé, macros = entrée la plus récente.
      const seen = new Map<
        string,
        { count: number; entry: NonNullable<typeof data>[number] }
      >();
      for (const entry of data ?? []) {
        const key = (entry.name ?? "").trim().toLowerCase();
        if (!key || key.length < 2) continue;
        if (!seen.has(key)) {
          seen.set(key, { count: 1, entry });
        } else {
          seen.get(key)!.count++;
        }
      }

      return [...seen.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map(({ entry, count }) => ({
          id: `freq:${(entry.name ?? "").toLowerCase().trim()}`,
          name: entry.name ?? "",
          calories: entry.base_calories ?? entry.calories,
          proteins: entry.base_proteins ?? entry.proteins,
          carbs: entry.base_carbs ?? entry.carbs,
          fats: entry.base_fats ?? entry.fats,
          source: "custom" as const,
          // Astuce : on stocke le nombre d'utilisations dans quality_score pour
          // que l'affichage puisse l'exploiter sans changer l'interface.
          quality_score: count,
        }));
    },
  });
}
