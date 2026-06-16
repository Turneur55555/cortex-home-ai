import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Favoris nutritionnels — aliments/repas réutilisables en 1 tap.
export type NutritionFavorite = {
  id: string;
  name: string;
  meal: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
};

export type NewFavorite = Omit<NutritionFavorite, "id">;

// La table `nutrition_favorites` peut ne pas figurer dans les types générés.
// On utilise un client faiblement typé, localisé à ce hook, pour éviter d'avoir
// à régénérer tout le fichier supabase/types.ts.
type LooseQuery = {
  select: (cols: string) => {
    order: (
      col: string,
      opts: { ascending: boolean },
    ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
  };
  insert: (values: unknown) => Promise<{ error: unknown }>;
  delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
};
const favTable = (): LooseQuery =>
  (supabase as unknown as { from: (t: string) => LooseQuery }).from(
    "nutrition_favorites",
  );

export function useNutritionFavorites() {
  return useQuery({
    queryKey: ["nutrition_favorites"],
    staleTime: 60_000,
    queryFn: async (): Promise<NutritionFavorite[]> => {
      const { data, error } = await favTable()
        .select("id, name, meal, calories, proteins, carbs, fats")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NutritionFavorite[];
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
      const { error } = await favTable().insert({ ...fav, user_id: user.id });
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
      const { error } = await favTable().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition_favorites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
