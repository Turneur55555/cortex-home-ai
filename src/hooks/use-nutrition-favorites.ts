import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;

// Favoris nutritionnels — aliments/repas réutilisables en 1 tap.
// Client typé : la table `nutrition_favorites` figure dans supabase/types.ts.
export type NutritionFavorite = {
  id: string;
  name: string;
  meal: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  // Grammes/unité de la portion utilisée à la création du favori — absents
  // (null) pour les favoris créés avant cette colonne, comportement "portion"
  // inchangé pour eux. base_* = valeurs pour 100 g (comme public.nutrition).
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  consumed_quantity: number | null;
  consumed_unit: string | null;
  consumed_grams_per_unit: number | null;
};

export type NewFavorite = Omit<NutritionFavorite, "id">;

export function useNutritionFavorites() {
  return useQuery({
    queryKey: ["nutrition_favorites"],
    staleTime: 60_000,
    queryFn: async (): Promise<NutritionFavorite[]> => {
      const { data, error } = await supabase
        .from("nutrition_favorites")
        .select(
          "id, name, meal, calories, proteins, carbs, fats, base_calories, base_proteins, base_carbs, base_fats, consumed_quantity, consumed_unit, consumed_grams_per_unit",
        )
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fav: NewFavorite) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition_favorites")
        .insert({ ...fav, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajouté aux favoris");
      qc.invalidateQueries({ queryKey: ["nutrition_favorites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nutrition_favorites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition_favorites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
