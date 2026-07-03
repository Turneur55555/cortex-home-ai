import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import { ingredientMacros, recipeMacros, perServing, type MacroTotals } from "@/lib/nutrition/recipes";

/**
 * CRUD typé des recettes Nutrition V2 (react-query).
 * Tables : recipes, recipe_ingredients. Les macros sont dérivées via le domaine
 * pur (lib/nutrition/recipes), à partir des champs *_per_100g de items.
 * Client typé : ces tables figurent dans supabase/types.ts.
 */
const db = supabase;

export interface Recipe {
  id: string;
  user_id: string | null;
  name: string;
  servings: number;
  prep_minutes: number | null;
  instructions: string | null;
  image_path: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  user_id: string;
  item_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  sort_order: number;
  created_at: string;
  /** Macros per_100g héritées de l'item lié (jointure). */
  items?: {
    calories_per_100g: number | null;
    protein_per_100g: number | null;
    carbs_per_100g: number | null;
    fat_per_100g: number | null;
  } | null;
}

export interface RecipeWithMacros extends Recipe {
  ingredients: RecipeIngredient[];
  totalMacros: MacroTotals;
  perServingMacros: MacroTotals;
}

const RECIPES_KEY = ["recipes"] as const;
const recipeKey = (id: string) => ["recipe", id] as const;

const toMacroInput = (ing: RecipeIngredient) => ({
  grams: ing.grams,
  caloriesPer100g: ing.items?.calories_per_100g,
  proteinPer100g: ing.items?.protein_per_100g,
  carbsPer100g: ing.items?.carbs_per_100g,
  fatPer100g: ing.items?.fat_per_100g,
});

export function useRecipes() {
  return useQuery({
    queryKey: RECIPES_KEY,
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await db.from("recipes").select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Recipe[];
    },
  });
}

/** Recette complète avec ingrédients (jointure macros items) + macros calculées. */
export function useRecipe(id: string | null | undefined) {
  return useQuery({
    queryKey: recipeKey(id ?? "none"),
    enabled: !!id,
    queryFn: async (): Promise<RecipeWithMacros | null> => {
      if (!id) return null;
      const { data: recipe, error } = await db.from("recipes").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: ings, error: ingErr } = await db
        .from("recipe_ingredients")
        .select("*, items(calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true });
      if (ingErr) throw ingErr;
      const ingredients = (ings ?? []) as unknown as RecipeIngredient[];
      const total = recipeMacros(ingredients.map(toMacroInput));
      return {
        ...(recipe as Recipe),
        ingredients,
        totalMacros: total,
        perServingMacros: perServing(total, (recipe as Recipe).servings),
      };
    },
  });
}

export interface RecipeIngredientInput {
  item_id?: string | null;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  grams?: number | null;
}

export interface CreateRecipeInput {
  name: string;
  servings: number;
  prep_minutes?: number | null;
  instructions?: string | null;
  image_path?: string | null;
  tags?: string[] | null;
  ingredients?: RecipeIngredientInput[];
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecipeInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data: recipe, error } = await db
        .from("recipes")
        .insert({
          user_id: user.id,
          name: input.name,
          servings: input.servings,
          prep_minutes: input.prep_minutes ?? null,
          instructions: input.instructions ?? null,
          image_path: input.image_path ?? null,
          tags: input.tags ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const ings = input.ingredients ?? [];
      if (ings.length > 0) {
        const rows = ings.map((g, i) => ({
          recipe_id: recipe.id,
          user_id: user.id,
          item_id: g.item_id ?? null,
          name: g.name,
          quantity: g.quantity ?? null,
          unit: g.unit ?? null,
          grams: g.grams ?? null,
          sort_order: i,
        }));
        const { error: ingErr } = await db.from("recipe_ingredients").insert(rows);
        if (ingErr) throw ingErr;
      }
      return { id: recipe.id };
    },
    onSuccess: ({ id }: { id: string }) => {
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
      qc.invalidateQueries({ queryKey: recipeKey(id) });
      toast.success("Recette enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Remplace tous les ingrédients d'une recette (delete + insert renuméroté). */
export function useReplaceRecipeIngredients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { recipeId: string; ingredients: RecipeIngredientInput[] }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error: delErr } = await db.from("recipe_ingredients").delete().eq("recipe_id", params.recipeId);
      if (delErr) throw delErr;
      const rows = params.ingredients.map((g, i) => ({
        recipe_id: params.recipeId,
        user_id: user.id,
        item_id: g.item_id ?? null,
        name: g.name,
        quantity: g.quantity ?? null,
        unit: g.unit ?? null,
        grams: g.grams ?? null,
        sort_order: i,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await db.from("recipe_ingredients").insert(rows);
        if (insErr) throw insErr;
      }
      return { recipeId: params.recipeId };
    },
    onSuccess: ({ recipeId }: { recipeId: string }) => qc.invalidateQueries({ queryKey: recipeKey(recipeId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("recipes").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECIPES_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export { ingredientMacros };
