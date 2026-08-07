import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import { recipeMacros, perServing, scaleServings, type MacroTotals } from "@/lib/nutrition/recipes";
import type { ImportedRecipe, RecipeSourceKind } from "@/lib/nutrition/recipeImport";

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
  source_url: string | null;
  source_image_url: string | null;
  /** Légende/description ORIGINALE du post source — distincte de `notes` (hypothèses de l'IA). */
  source_description: string | null;
  /** Résumé structuré généré par l'IA (principe, ingrédients clés, cuisson, points importants). */
  ai_summary: string | null;
  /** @handle Instagram de l'auteur — best-effort, peut être `null`. */
  source_author: string | null;
  cook_minutes: number | null;
  last_reanalyzed_at: string | null;
  reanalysis_count: number;
  confidence: number | null;
  notes: string | null;
  is_favorite: boolean;
  per_serving_calories: number | null;
  per_serving_proteins: number | null;
  per_serving_carbs: number | null;
  per_serving_fats: number | null;
  per_serving_fiber: number | null;
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
        .order("is_favorite", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Recipe[];
    },
  });
}

async function fetchRecipeWithMacros(id: string): Promise<RecipeWithMacros> {
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
}

/** Recette complète avec ingrédients (jointure macros items) + macros calculées. */
export function useRecipe(id: string | null | undefined) {
  return useQuery({
    queryKey: recipeKey(id ?? "none"),
    enabled: !!id,
    queryFn: () => fetchRecipeWithMacros(id as string),
  });
}

export interface RecipeIngredientPatch {
  name: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
}

export interface RecipeUpdatePatch {
  id: string;
  name?: string;
  servings?: number;
  per_serving_calories?: number;
  per_serving_proteins?: number;
  per_serving_carbs?: number;
  per_serving_fats?: number;
  per_serving_fiber?: number;
  tags?: string[];
  ai_summary?: string | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  /** Si fourni, remplace intégralement les ingrédients existants (delete + insert). */
  ingredients?: RecipeIngredientPatch[];
}

/** Modifie une recette (titre/portions/macros/ingrédients) — pour la fiche recette (module Recettes). */
export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ingredients, ...patch }: RecipeUpdatePatch) => {
      if (Object.keys(patch).length > 0) {
        const { error } = await db.from("recipes").update(patch).eq("id", id);
        if (error) throw error;
      }
      if (ingredients) {
        const {
          data: { user },
        } = await supabaseTyped.auth.getUser();
        if (!user) throw new Error("Non authentifié");
        const { error: delErr } = await db.from("recipe_ingredients").delete().eq("recipe_id", id);
        if (delErr) throw delErr;
        if (ingredients.length > 0) {
          const rows = ingredients.map((ing, idx) => ({
            recipe_id: id,
            user_id: user.id,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            grams: ing.grams,
            sort_order: idx,
          }));
          const { error: insErr } = await db.from("recipe_ingredients").insert(rows);
          if (insErr) throw insErr;
        }
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success("Recette mise à jour");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
      qc.invalidateQueries({ queryKey: recipeKey(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleRecipeFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await db.from("recipes").update({ is_favorite: isFavorite }).eq("id", id);
      if (error) throw error;
      return { id, isFavorite };
    },
    onSuccess: ({ id, isFavorite }) => {
      toast.success(isFavorite ? "Ajoutée aux favoris" : "Retirée des favoris");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
      qc.invalidateQueries({ queryKey: recipeKey(id) });
    },
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
    onSuccess: () => {
      toast.success("Recette supprimée");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Duplique une recette (nouvelle ligne `recipes` + copie des ingrédients) — jamais de source_url (évite un doublon de dédoublonnage import). */
export function useDuplicateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const original = await fetchRecipeWithMacros(id);
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: inserted, error: insErr } = await db
        .from("recipes")
        .insert({
          user_id: user.id,
          name: `${original.name} (copie)`,
          servings: original.servings,
          prep_minutes: original.prep_minutes,
          cook_minutes: original.cook_minutes,
          instructions: original.instructions,
          tags: original.tags,
          source_kind: null,
          source_url: null,
          source_image_url: original.source_image_url,
          source_description: original.source_description,
          ai_summary: original.ai_summary,
          source_author: original.source_author,
          confidence: original.confidence,
          notes: original.notes,
          per_serving_calories: original.per_serving_calories,
          per_serving_proteins: original.per_serving_proteins,
          per_serving_carbs: original.per_serving_carbs,
          per_serving_fats: original.per_serving_fats,
          per_serving_fiber: original.per_serving_fiber,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Duplication impossible");
      const newId = (inserted as { id: string }).id;

      if (original.ingredients.length > 0) {
        const rows = original.ingredients.map((ing) => ({
          recipe_id: newId,
          user_id: user.id,
          item_id: ing.item_id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          grams: ing.grams,
          sort_order: ing.sort_order,
        }));
        const { error: ingErr } = await db.from("recipe_ingredients").insert(rows);
        if (ingErr) throw ingErr;
      }
      return newId;
    },
    onSuccess: () => {
      toast.success("Recette dupliquée");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

interface ReanalyzeArgs {
  recipeId: string;
  sourceKind: RecipeSourceKind;
  sourceUrl: string;
}

interface RecipeReanalyzeEdgeResponse {
  recipe?: ImportedRecipe;
  error?: string;
}

/**
 * "Réanalyser la recette" — repart du lien Instagram enregistré et relance
 * tout le pipeline (edge function `recipe-import`, `reanalyze: true` :
 * ignore le cache/l'association existante, voir recipe-import-handler.ts).
 * Ne modifie PAS `recipes` — retourne la fiche fraîche pour que l'appelant
 * (RecipeDetailSheet) l'affiche en comparaison et laisse l'utilisateur
 * décider via `useUpdateRecipe` de l'appliquer ou non. L'historique de
 * réanalyse (compteur + date), lui, est mis à jour côté serveur à chaque
 * appel, qu'elle soit appliquée ou non — d'où l'invalidation de la recette.
 */
export function useReanalyzeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      sourceKind,
      sourceUrl,
    }: ReanalyzeArgs): Promise<ImportedRecipe> => {
      const { data, error } = await supabaseTyped.functions.invoke<RecipeReanalyzeEdgeResponse>(
        "recipe-import",
        {
          body: {
            source: sourceKind,
            input: { kind: "url", value: sourceUrl },
            reanalyze: true,
            recipeId,
          },
        },
      );
      if (error) throw new Error(error.message);
      if (!data || data.error || !data.recipe)
        throw new Error(data?.error ?? "La réanalyse a échoué.");
      return data.recipe;
    },
    onSuccess: (_result, { recipeId }) => {
      qc.invalidateQueries({ queryKey: recipeKey(recipeId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
