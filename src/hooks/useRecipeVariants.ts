import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import { getIsOnline } from "@/lib/offline/networkStatus";
import type {
  RecipeVariant,
  RecipeVariantRequestType,
  RecipeVariantSourceSnapshot,
} from "@/lib/nutrition/recipeVariants/types";
import { RECIPES_KEY, type RecipeWithMacros } from "@/hooks/useRecipes";

/**
 * "Proposer des variantes" (module Recettes) — génération IA (endpoint
 * stateless `recipe-variants`) et enregistrement d'une variante comme
 * nouvelle recette indépendante. Comme `useDuplicateRecipe`/
 * `useReanalyzeRecipe` : opérations IA/serveur, **en ligne uniquement**, ne
 * passent JAMAIS par le repository offline (`createOfflineRepository`) — la
 * recette originale, elle, n'est jamais lue en écriture ici. Logique des
 * mutations extraite en fonctions simples (`generateRecipeVariants`/
 * `saveRecipeVariantAsRecipe`) pour être testable directement, même pattern
 * que `resolveCustomExerciseMuscles` (useUserExercisePhotos.ts).
 */
const db = supabase;

function toSourceSnapshot(recipe: RecipeWithMacros): RecipeVariantSourceSnapshot {
  return {
    name: recipe.name,
    servings: recipe.servings,
    perServing: {
      calories: recipe.perServingMacros.calories,
      proteins: recipe.perServingMacros.protein,
      carbs: recipe.perServingMacros.carbs,
      fats: recipe.perServingMacros.fat,
      fiber: recipe.per_serving_fiber ?? 0,
    },
    ingredients: recipe.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? 0,
      unit: i.unit ?? "pièce",
      grams: i.grams,
      category:
        (i.category as RecipeVariantSourceSnapshot["ingredients"][number]["category"]) ?? null,
    })),
    instructions: recipe.instructions,
  };
}

export interface GenerateVariantsArgs {
  recipe: RecipeWithMacros;
  requestType: RecipeVariantRequestType;
  /** Requis uniquement pour `requestType: "custom"`. */
  customPrompt?: string;
}

interface RecipeVariantsEdgeResponse {
  variants?: RecipeVariant[];
  error?: string;
}

/** Un seul appel edge function (donc un seul appel Gemini côté serveur) par demande — voir recipe-variants-handler.ts. */
export async function generateRecipeVariants({
  recipe,
  requestType,
  customPrompt,
}: GenerateVariantsArgs): Promise<RecipeVariant[]> {
  if (!getIsOnline()) {
    throw new Error("Générer des variantes nécessite une connexion Internet.");
  }
  const { data, error } = await supabaseTyped.functions.invoke<RecipeVariantsEdgeResponse>(
    "recipe-variants",
    {
      body: {
        requestType,
        customPrompt,
        recipe: toSourceSnapshot(recipe),
      },
    },
  );
  if (error) throw new Error(error.message);
  if (!data || data.error || !data.variants) {
    throw new Error(data?.error ?? "La génération des variantes a échoué.");
  }
  if (data.variants.length !== 3) {
    throw new Error("Réponse IA invalide : nombre de variantes incorrect.");
  }
  return data.variants;
}

export function useGenerateRecipeVariants() {
  return useMutation({
    mutationFn: generateRecipeVariants,
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface SaveVariantArgs {
  sourceRecipeId: string;
  variant: RecipeVariant;
}

/**
 * Enregistre une variante comme nouvelle recette indépendante — ne modifie
 * JAMAIS la recette originale. Même schéma d'insertion directe que
 * `useDuplicateRecipe` (bypass volontaire du repository offline : nécessite
 * une connexion, lecture/écriture serveur immédiate).
 */
export async function saveRecipeVariantAsRecipe({
  sourceRecipeId,
  variant,
}: SaveVariantArgs): Promise<string> {
  if (!getIsOnline()) {
    throw new Error("Enregistrer une variante nécessite une connexion Internet.");
  }
  const {
    data: { user },
  } = await supabaseTyped.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: inserted, error: insErr } = await db
    .from("recipes")
    .insert({
      user_id: user.id,
      name: variant.name,
      servings: variant.servings,
      instructions: variant.instructions,
      notes: variant.explanation,
      source_recipe_id: sourceRecipeId,
      source_kind: null,
      source_url: null,
      per_serving_calories: variant.perServing.calories,
      per_serving_proteins: variant.perServing.proteins,
      per_serving_carbs: variant.perServing.carbs,
      per_serving_fats: variant.perServing.fats,
      per_serving_fiber: variant.perServing.fiber,
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("Enregistrement de la variante impossible");
  const newId = (inserted as { id: string }).id;

  if (variant.ingredients.length > 0) {
    const rows = variant.ingredients.map((ing, idx) => ({
      recipe_id: newId,
      user_id: user.id,
      item_id: null,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      grams: ing.grams,
      category: ing.category,
      sort_order: idx,
    }));
    const { error: ingErr } = await db.from("recipe_ingredients").insert(rows);
    if (ingErr) throw ingErr;
  }
  return newId;
}

export function useSaveRecipeVariantAsRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveRecipeVariantAsRecipe,
    onSuccess: () => {
      toast.success("Variante enregistrée comme nouvelle recette");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
