import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CreateCustomFoodInput {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  /** Portion par défaut (déjà convertie en grammes) — optionnelle. */
  servingGrams?: number | null;
  servingUnit?: string | null;
}

/**
 * Crée un aliment personnalisé (`foods`, source='custom') associé à un
 * code-barres introuvable dans OpenFoodFacts/USDA, via la RPC atomique
 * `create_custom_food_with_barcode`. Rend le produit immédiatement
 * scannable pour tous les futurs scans du même code-barres.
 */
export function useCreateCustomFoodWithBarcode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomFoodInput) => {
      const { data, error } = await (supabase.rpc as any)("create_custom_food_with_barcode", {
        p_barcode: input.barcode,
        p_name: input.name,
        p_brand: input.brand ?? undefined,
        p_category: input.category ?? undefined,
        p_calories: input.calories ?? undefined,
        p_protein_g: input.proteins ?? undefined,
        p_carbs_g: input.carbs ?? undefined,
        p_fat_g: input.fats ?? undefined,
        p_serving_grams: input.servingGrams ?? undefined,
        p_serving_unit: input.servingUnit ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_foods"] });
    },
  });
}
