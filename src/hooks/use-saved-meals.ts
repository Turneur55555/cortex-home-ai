import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Repas enregistrés — modèles multi-aliments réutilisables en 1 tap.
// Les tables `saved_meals`/`saved_meal_items` et les RPC ne figurent pas dans
// les types générés : on utilise un client faiblement typé localisé à ce hook
// (même approche que use-nutrition-favorites), pour éviter de régénérer
// supabase/types.ts.

export type SavedMealItem = {
  id: string;
  name: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  serving_count: number | null;
  sort_order: number;
};

export type SavedMeal = {
  id: string;
  name: string;
  meal: string | null;
  saved_meal_items: SavedMealItem[];
};

export type NewSavedMealItem = {
  food_id?: string | null;
  name: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  base_calories?: number | null;
  base_proteins?: number | null;
  base_carbs?: number | null;
  base_fats?: number | null;
  serving_count?: number;
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
};

type LooseClient = {
  from: (t: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};
const loose = (): LooseClient => supabase as unknown as LooseClient;

export function useSavedMeals() {
  return useQuery({
    queryKey: ["saved_meals"],
    staleTime: 60_000,
    queryFn: async (): Promise<SavedMeal[]> => {
      const { data, error } = await loose()
        .from("saved_meals")
        .select(
          "id, name, meal, saved_meal_items(id, name, calories, proteins, carbs, fats, serving_count, sort_order)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedMeal[];
    },
  });
}

export function useCreateSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      meal: string | null;
      items: NewSavedMealItem[];
    }) => {
      const { error } = await loose().rpc("create_saved_meal", {
        p_name: input.name,
        p_meal: input.meal,
        p_items: input.items,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repas enregistré");
      qc.invalidateQueries({ queryKey: ["saved_meals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLogSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; date: string; meal?: string | null }) => {
      const { error } = await loose().rpc("log_saved_meal", {
        p_meal_id: input.id,
        p_date: input.date,
        p_meal: input.meal ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Repas ajouté à la journée");
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await loose().from("saved_meals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repas supprimé");
      qc.invalidateQueries({ queryKey: ["saved_meals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
