// Contrats de "Proposer des variantes" (module Recettes) — génère EXACTEMENT
// 3 variantes réellement différentes d'une recette existante en UN SEUL appel
// Gemini (tool calling forcé, même mécanisme que recipe-parser.ts). Miroir
// volontaire de src/lib/nutrition/recipeVariants/types.ts (frontend), comme
// recipe-import.ts / meal-items.ts (les deux runtimes ne partagent pas de
// bundler).
import type { IngredientCategory, RecipeMacrosExtraction } from "./recipe-import.ts";

export type RecipeVariantRequestType = "dairy_free_vegan" | "dairy_free_remove" | "more_protein" | "custom";

export function isRecipeVariantRequestType(v: unknown): v is RecipeVariantRequestType {
  return v === "dairy_free_vegan" || v === "dairy_free_remove" || v === "more_protein" || v === "custom";
}

export interface RecipeVariantIngredient {
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  category: IngredientCategory | null;
}

/** Snapshot de la recette originale envoyé par le client — pas de lecture serveur (endpoint stateless, comme recipe-assistant). */
export interface RecipeVariantSourceSnapshot {
  name: string;
  servings: number;
  perServing: RecipeMacrosExtraction;
  ingredients: RecipeVariantIngredient[];
  instructions: string | null;
}

/** Une variante générée — toujours 3 par réponse, jamais une simple renomination d'ingrédient. */
export interface RecipeVariantResult {
  name: string;
  /** Courte explication de la modification apportée par rapport à la recette originale. */
  explanation: string;
  servings: number;
  instructions: string;
  ingredients: RecipeVariantIngredient[];
  perServing: RecipeMacrosExtraction;
}

export type RecipeVariantErrorCode = "invalid_input" | "ai_error" | "timeout" | "rate_limited" | "server_error";

export class RecipeVariantError extends Error {
  code: RecipeVariantErrorCode;
  constructor(code: RecipeVariantErrorCode, message: string) {
    super(message);
    this.name = "RecipeVariantError";
    this.code = code;
  }
}
