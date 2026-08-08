import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
const supabase = supabaseTyped as any;
import type { Json } from "@/integrations/supabase/types";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

// Repas enregistrés — modèles multi-aliments réutilisables en 1 tap.
// Client typé : `saved_meals`/`saved_meal_items` et les RPC figurent dans
// supabase/types.ts (plus de client « loose »).
//
// `useCreateSavedMeal`/`useUpdateSavedMeal`/`useDuplicateSavedMeal`/
// `useLogSavedMeal` passent par des RPC Supabase (`create_saved_meal`,
// `update_saved_meal`, `duplicate_saved_meal`, `log_saved_meal`) qui gèrent
// de façon atomique côté serveur les lignes `saved_meal_items` liées — le
// sync engine offline générique ne sait rejouer que des `.upsert()`/
// `.update()`/`.delete()` sur une table, pas un appel RPC. Dupliquer cette
// logique métier côté client serait de la sur-ingénierie hors périmètre :
// ces 4 hooks restent donc en ligne uniquement (même raisonnement que
// `useDuplicateRecipe`/`useReanalyzeRecipe` dans `useRecipes.ts`).
//
// En revanche `useSavedMeals()` (lecture simple) et `useDeleteSavedMeal()`
// (suppression simple) sont offline-first (cf. src/lib/offline/), même
// pattern que `useRecipes.ts`. La lecture hors ligne n'a pas la jointure
// `saved_meal_items` (disponible seulement en ligne) — `saved_meal_items`
// est donc optionnel sur `SavedMeal`.

export type SavedMealItem = {
  id: string;
  food_id: string | null;
  name: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  serving_count: number | null;
  consumed_quantity: number | null;
  consumed_unit: string | null;
  consumed_grams_per_unit: number | null;
  sort_order: number;
};

export type SavedMeal = {
  id: string;
  name: string;
  meal: string | null;
  /** Jointure `saved_meal_items` — présente seulement quand récupérée en ligne. */
  saved_meal_items?: SavedMealItem[];
};

/** Ligne locale brute (sans jointure). */
interface SavedMealRow {
  id: string;
  user_id: string;
  name: string;
  meal: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const savedMealsRepo = createOfflineRepository<SavedMealRow>("saved_meals");

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
  consumed_grams_per_unit?: number | null;
};

export function useSavedMeals() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["saved_meals", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<SavedMeal[]> => {
      if (!userId) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await supabase
            .from("saved_meals")
            .select(
              "id, name, meal, saved_meal_items(id, food_id, name, calories, proteins, carbs, fats, base_calories, base_proteins, base_carbs, base_fats, serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit, sort_order)",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (!error && data) {
            const rows = (data as Array<SavedMeal & { saved_meal_items?: unknown }>).map(
              ({ saved_meal_items: _items, ...rest }) => rest,
            );
            await hydrateEntitiesFromServer("saved_meals", userId, rows as SavedMealRow[]);
            return data as SavedMeal[];
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      const local = await savedMealsRepo.list(userId);
      return [...local].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}

export function useCreateSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; meal: string | null; items: NewSavedMealItem[] }) => {
      const { error } = await supabase.rpc("create_saved_meal", {
        p_name: input.name,
        p_meal: input.meal,
        p_items: input.items as unknown as Json,
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

export function useUpdateSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      meal: string | null;
      items: NewSavedMealItem[];
    }) => {
      const { error } = await supabase.rpc("update_saved_meal", {
        p_id: input.id,
        p_name: input.name,
        p_meal: input.meal,
        p_items: input.items as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repas mis à jour");
      qc.invalidateQueries({ queryKey: ["saved_meals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDuplicateSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("duplicate_saved_meal", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repas dupliqué");
      qc.invalidateQueries({ queryKey: ["saved_meals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLogSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; date: string; meal?: string | null }) => {
      const { error } = await supabase.rpc("log_saved_meal", {
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await savedMealsRepo.remove(id, user.id);
    },
    onSuccess: () => {
      toast.success("Repas supprimé");
      qc.invalidateQueries({ queryKey: ["saved_meals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
