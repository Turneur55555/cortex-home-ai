import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

/**
 * Aliments personnels créés par l'utilisateur — table `food_custom_foods`.
 * Offline-first (cf. src/lib/offline/), même pattern que `useRecipes.ts` :
 * lecture locale (IndexedDB) d'abord, rafraîchie depuis Supabase si en ligne.
 */

export interface CustomFoodRow {
  id: string;
  user_id: string;
  food_id: string | null;
  name: string;
  brand: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  default_serving_grams: number | null;
  created_at: string;
  updated_at: string;
}

export const customFoodsRepo = createOfflineRepository<CustomFoodRow>("food_custom_foods");

export function useCustomFoods() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["custom_foods", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      if (!userId) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await supabase
            .from("food_custom_foods")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(100);
          if (!error && data) {
            await hydrateEntitiesFromServer("food_custom_foods", userId, data as CustomFoodRow[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      const local = await customFoodsRepo.list(userId);
      const sorted = [...local]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 100);
      return sorted.map((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand ?? undefined,
        image: undefined,
        calories: Number(r.calories ?? 0),
        proteins: Number(r.proteins ?? 0),
        carbs: Number(r.carbs ?? 0),
        fats: Number(r.fats ?? 0),
        source: "custom" as const,
      }));
    },
  });
}
