/**
 * "Proposer des variantes" (module Recettes) — contrats de domaine (zéro
 * React, zéro couleur). Miroir volontaire de
 * supabase/functions/_shared/recipe-variants.ts (les deux runtimes ne
 * partagent pas de bundler), même pattern que recipeImport/types.ts.
 */
import type { IngredientCategory } from "@/lib/nutrition/recipeImport";

export type RecipeVariantRequestType =
  | "dairy_free_vegan"
  | "dairy_free_remove"
  | "more_protein"
  | "custom";

export interface RecipeVariantIngredient {
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  category: IngredientCategory | null;
}

export interface RecipeVariantMacros {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
}

/** Une des 3 variantes générées par l'IA (avant tout enregistrement). */
export interface RecipeVariant {
  name: string;
  /** Courte explication de la modification apportée par rapport à la recette originale. */
  explanation: string;
  servings: number;
  instructions: string;
  ingredients: RecipeVariantIngredient[];
  perServing: RecipeVariantMacros;
}

/** Snapshot envoyé au serveur (endpoint stateless, aucune lecture DB côté serveur). */
export interface RecipeVariantSourceSnapshot {
  name: string;
  servings: number;
  perServing: RecipeVariantMacros;
  ingredients: RecipeVariantIngredient[];
  instructions: string | null;
}

export const RECIPE_VARIANT_CUSTOM_EXAMPLES = [
  "Remplace le poulet par du thon",
  "Remplace le poulet par du saumon",
  "Fais une version moins calorique",
  "Remplace le riz par des pommes de terre",
] as const;
