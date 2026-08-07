import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import {
  buildShoppingList,
  type PlannedIngredient,
  type ShoppingLine,
} from "@/lib/nutrition/shoppingList";
import { resolveIngredientCategory } from "@/lib/nutrition/ingredientCategory";
import type { IngredientCategory } from "@/lib/nutrition/recipeImport/types";

/**
 * Liste de courses depuis des recettes sélectionnées (module "Recettes" —
 * distinct du planning hebdo `useMealPlan.ts`, mais réutilise le même
 * domaine pur `buildShoppingList`/table `shopping_list`).
 *
 * Les quantités de `recipe_ingredients` représentent déjà la recette telle
 * qu'écrite (pas "par portion") — `servings: 1` ici, contrairement au
 * planning qui multiplie par les portions planifiées.
 */
const db = supabase;

const shoppingListKey = ["shopping_list"] as const;

/** Fusionne les ingrédients de plusieurs recettes (dédoublonnage + somme des quantités), groupés par rayon. */
export function useRecipesShoppingPreview(recipeIds: string[]) {
  return useQuery({
    queryKey: ["shopping_list_recipes_preview", [...recipeIds].sort().join(",")],
    enabled: recipeIds.length > 0,
    queryFn: async (): Promise<ShoppingLine[]> => {
      if (recipeIds.length === 0) return [];
      const { data, error } = await db
        .from("recipe_ingredients")
        .select("name, quantity, unit, category")
        .in("recipe_id", recipeIds);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        name: string;
        quantity: number | null;
        unit: string | null;
        category: string | null;
      }>;
      const planned: PlannedIngredient[] = rows.map((ing) => ({
        name: ing.name,
        unit: ing.unit,
        quantity: ing.quantity,
        servings: 1,
        category: resolveIngredientCategory(ing.name, ing.category as IngredientCategory | null),
      }));
      return buildShoppingList(planned, [], { includeSatisfied: true });
    },
  });
}

/** Enregistre la liste fusionnée dans `shopping_list` (table existante, catégorie incluse). */
export function useSaveRecipesShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: ShoppingLine[]) => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const rows = lines
        .filter((l) => l.needed > 0)
        .map((l) => ({
          user_id: user.id,
          name: l.name,
          quantity: l.needed,
          unit: l.unit,
          category: l.category ?? null,
        }));
      if (rows.length === 0) return { inserted: 0 };
      const { error } = await db.from("shopping_list").insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: ({ inserted }: { inserted: number }) => {
      qc.invalidateQueries({ queryKey: shoppingListKey });
      toast.success(`${inserted} article(s) ajouté(s) à la liste de courses`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface ShoppingListItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  done: boolean;
  added_at: string;
}

/** Liste de courses persistée de l'utilisateur, groupable par catégorie côté UI. */
export function useShoppingList() {
  return useQuery({
    queryKey: shoppingListKey,
    queryFn: async (): Promise<ShoppingListItem[]> => {
      const { data, error } = await db
        .from("shopping_list")
        .select("*")
        .order("done", { ascending: true })
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShoppingListItem[];
    },
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await db.from("shopping_list").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shoppingListKey }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("shopping_list").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shoppingListKey }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Retire toutes les lignes cochées (achetées) d'un coup. */
export function useClearBoughtItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("shopping_list")
        .delete()
        .eq("user_id", user.id)
        .eq("done", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shoppingListKey });
      toast.success("Articles achetés retirés");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
