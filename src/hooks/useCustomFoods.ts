import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FoodSuggestion } from "@/services/foodSuggestion";

/**
 * Aliments personnels créés par l'utilisateur — table `foods`, RLS `user_id = auth.uid()`
 * (voir supabase/migrations/20260618101644_nutrition_foods_custom_user_rls.sql).
 * Alimenté par NutritionSheet.saveCustomFood() lors d'une saisie manuelle avec poids total.
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
        .from("foods")
        .select("id, name, brand, image_url, calories, protein_g, carbs_g, fat_g")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand ?? undefined,
        image: r.image_url ?? undefined,
        calories: r.calories,
        proteins: r.protein_g,
        carbs: r.carbs_g,
        fats: r.fat_g,
        source: "custom" as const,
      }));
    },
  });
}
