import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FoodSuggestion } from "@/services/foodSuggestion";

/**
 * Aliments personnels créés par l'utilisateur — table `food_custom_foods`.
 */
export function useCustomFoods() {
  return useQuery({
    queryKey: ["custom_foods"],
    staleTime: 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("food_custom_foods")
        .select("id, name, brand, calories, proteins, carbs, fats")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => ({
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
