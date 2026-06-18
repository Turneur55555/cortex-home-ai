import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildShoppingList,
  type PlannedIngredient,
  type ShoppingLine,
  type StockLevel,
} from "@/lib/nutrition/shoppingList";

/**
 * Planning de repas Nutrition V2 + génération de liste de courses depuis le stock.
 * Tables : meal_plans, recipe_ingredients, items, shopping_list.
 */
const db = supabase as any;

export interface MealPlanEntry {
  id: string;
  user_id: string;
  date: string;
  meal: string;
  recipe_id: string | null;
  custom_name: string | null;
  servings: number;
  sort_order: number;
  created_at: string;
  recipes?: { id: string; name: string; servings: number } | null;
}

const planKey = (start: string, end: string) => ["meal_plans", start, end] as const;

/** Planning sur une plage de dates (incluses), trié par date puis ordre. */
export function useMealPlan(startDate: string | null | undefined, endDate: string | null | undefined) {
  return useQuery({
    queryKey: planKey(startDate ?? "none", endDate ?? "none"),
    enabled: !!startDate && !!endDate,
    queryFn: async (): Promise<MealPlanEntry[]> => {
      if (!startDate || !endDate) return [];
      const { data, error } = await db
        .from("meal_plans")
        .select("*, recipes(id, name, servings)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MealPlanEntry[];
    },
  });
}

export interface AddMealPlanInput {
  date: string;
  meal: string;
  recipe_id?: string | null;
  custom_name?: string | null;
  servings?: number;
  sort_order?: number;
}

export function useAddMealPlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddMealPlanInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db.from("meal_plans").insert({
        user_id: user.id,
        date: input.date,
        meal: input.meal,
        recipe_id: input.recipe_id ?? null,
        custom_name: input.custom_name ?? null,
        servings: input.servings ?? 1,
        sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteMealPlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meal_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Calcule la liste de courses pour une plage de dates : ingrédients requis par
 * le planning (quantité × portions) moins le stock courant (items), via le
 * domaine pur buildShoppingList. Lecture seule (n'écrit rien).
 */
export function useGenerateShoppingList(startDate: string | null | undefined, endDate: string | null | undefined) {
  return useQuery({
    queryKey: ["shopping_list_preview", startDate ?? "none", endDate ?? "none"],
    enabled: !!startDate && !!endDate,
    queryFn: async (): Promise<ShoppingLine[]> => {
      if (!startDate || !endDate) return [];

      // 1. Repas planifiés liés à une recette sur la plage.
      const { data: meals, error: mErr } = await db
        .from("meal_plans")
        .select("recipe_id, servings")
        .gte("date", startDate)
        .lte("date", endDate)
        .not("recipe_id", "is", null);
      if (mErr) throw mErr;
      const plans = (meals ?? []) as Array<{ recipe_id: string; servings: number | null }>;
      if (plans.length === 0) return [];

      // 2. Ingrédients de toutes les recettes concernées.
      const recipeIds = Array.from(new Set(plans.map((p) => p.recipe_id)));
      const { data: ings, error: iErr } = await db
        .from("recipe_ingredients")
        .select("recipe_id, item_id, name, quantity, unit")
        .in("recipe_id", recipeIds);
      if (iErr) throw iErr;
      const ingredients = (ings ?? []) as Array<{
        recipe_id: string;
        item_id: string | null;
        name: string;
        quantity: number | null;
        unit: string | null;
      }>;

      // 3. Multiplie chaque ingrédient par les portions planifiées de sa recette.
      const planned: PlannedIngredient[] = [];
      for (const plan of plans) {
        const servings = plan.servings ?? 1;
        for (const ing of ingredients) {
          if (ing.recipe_id !== plan.recipe_id) continue;
          planned.push({
            itemId: ing.item_id,
            name: ing.name,
            unit: ing.unit,
            quantity: ing.quantity,
            servings,
          });
        }
      }

      // 4. Stock courant — module Maison supprimé, on calcule sans déduction.
      const stock: StockLevel[] = [];

      return buildShoppingList(planned, stock);
    },
  });
}

/** Écrit les lignes « à acheter » dans shopping_list (table existante). */
export function useSaveShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: ShoppingLine[]) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const rows = lines
        .filter((l) => l.toBuy > 0)
        .map((l) => ({ user_id: user.id, name: l.name, quantity: l.toBuy, unit: l.unit, item_id: l.itemId }));
      if (rows.length === 0) return { inserted: 0 };
      const { error } = await db.from("shopping_list").insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: ({ inserted }: { inserted: number }) => {
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
      toast.success(`${inserted} article(s) ajouté(s) à la liste de courses`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
