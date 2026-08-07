import { useQuery } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import { recipeMacros, perServing, scaleServings, type MacroTotals } from "@/lib/nutrition/recipes";

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
  /** Recette importée par IA (recipeImport V2) — non-null seulement pour ces recettes. */
  source_kind: string | null;
  source_image_url: string | null;
  per_serving_calories: number | null;
  per_serving_proteins: number | null;
  per_serving_carbs: number | null;
  per_serving_fats: number | null;
  per_serving_fiber: number | null;
}

interface RecipeIngredient {
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
  /** Somme des grammages d'ingrédients (null si un ingrédient n'a pas de grammage connu). */
  totalGrams: number | null;
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
      const { data, error } = await db
        .from("recipes")
        .select("*")
        .order("name", { ascending: true });
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
      const r = recipe as Recipe;
      const totalGrams = ingredients.every((ing) => ing.grams != null && ing.grams > 0)
        ? ingredients.reduce((sum, ing) => sum + (ing.grams ?? 0), 0)
        : null;

      // Recette importée (V2 recipeImport) : ses ingrédients ont des noms
      // libres sans item_id fiable vers le catalogue `items` — recipeMacros()
      // renverrait 0. Ses macros/portion ont été figées à l'import
      // (recipes.per_serving_*) : c'est cette valeur qui fait foi.
      if (r.per_serving_calories != null) {
        const perS = {
          calories: r.per_serving_calories,
          protein: r.per_serving_proteins ?? 0,
          carbs: r.per_serving_carbs ?? 0,
          fat: r.per_serving_fats ?? 0,
        };
        return {
          ...r,
          ingredients,
          totalMacros: scaleServings(perS, r.servings),
          perServingMacros: perS,
          totalGrams,
        };
      }

      const total = recipeMacros(ingredients.map(toMacroInput));
      return {
        ...r,
        ingredients,
        totalMacros: total,
        perServingMacros: perServing(total, r.servings),
        totalGrams,
      };
    },
  });
}
