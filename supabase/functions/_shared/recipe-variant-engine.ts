// Validation STRICTE de la sortie IA de "Proposer des variantes" — contrairement
// à nutrition-engine.ts (import de recette, best-effort avec valeurs par
// défaut car une seule fiche est en jeu), ici une réponse structurellement
// invalide doit être REJETÉE plutôt que silencieusement complétée : mieux
// vaut un message d'erreur clair côté utilisateur qu'une recette corrompue
// enregistrable en un clic. Réutilise les mêmes bornes numériques que le
// reste du pipeline recette (safeNum, sanitizeCategory).
import { safeNum } from "./recipe-import.ts";
import { sanitizeCategory } from "./nutrition-engine.ts";
import { RecipeVariantError, type RecipeVariantIngredient, type RecipeVariantResult } from "./recipe-variants.ts";

function sanitizeIngredients(raw: unknown): RecipeVariantIngredient[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.slice(0, 40).map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    const grams = safeNum(i.grams, 0);
    return {
      name: typeof i.name === "string" && i.name.trim() ? i.name.trim().slice(0, 150) : "",
      quantity: safeNum(i.quantity, 1),
      unit: typeof i.unit === "string" && i.unit.trim() ? i.unit.trim().slice(0, 30) : "pièce",
      grams: grams > 0 ? grams : null,
      category: sanitizeCategory(i.category),
    };
  });
}

function sanitizeOneVariant(raw: unknown, index: number): RecipeVariantResult {
  const v = (raw ?? {}) as Record<string, unknown>;

  const name = typeof v.name === "string" ? v.name.trim().slice(0, 120) : "";
  if (!name) {
    throw new RecipeVariantError("ai_error", `Variante ${index + 1} invalide : nom manquant.`);
  }

  const explanation = typeof v.explanation === "string" ? v.explanation.trim().slice(0, 400) : "";
  if (!explanation) {
    throw new RecipeVariantError("ai_error", `Variante ${index + 1} invalide : explication manquante.`);
  }

  const instructions = typeof v.instructions === "string" ? v.instructions.trim().slice(0, 4000) : "";
  if (!instructions) {
    throw new RecipeVariantError("ai_error", `Variante ${index + 1} invalide : instructions manquantes.`);
  }

  const ingredients = sanitizeIngredients(v.ingredients);
  if (ingredients.length === 0 || ingredients.some((i) => !i.name)) {
    throw new RecipeVariantError("ai_error", `Variante ${index + 1} invalide : ingrédients manquants ou incomplets.`);
  }

  const ps = (v.per_serving ?? {}) as Record<string, unknown>;
  const perServing = {
    calories: safeNum(ps.calories, -1),
    proteins: safeNum(ps.proteins, -1),
    carbs: safeNum(ps.carbs, -1),
    fats: safeNum(ps.fats, -1),
    fiber: safeNum(ps.fiber, -1),
  };
  if (
    perServing.calories <= 0 ||
    perServing.proteins < 0 ||
    perServing.carbs < 0 ||
    perServing.fats < 0 ||
    perServing.fiber < 0
  ) {
    throw new RecipeVariantError("ai_error", `Variante ${index + 1} invalide : macros manquantes ou incohérentes.`);
  }

  const servings = Math.max(1, Math.round(safeNum(v.servings, 1)) || 1);

  return { name, explanation, servings, instructions, ingredients, perServing };
}

/** Transforme le JSON brut du tool call en `RecipeVariantResult[3]` — lève sinon. */
export function sanitizeRecipeVariants(raw: Record<string, unknown>): RecipeVariantResult[] {
  const rawVariants = raw.variants;
  if (!Array.isArray(rawVariants) || rawVariants.length !== 3) {
    throw new RecipeVariantError(
      "ai_error",
      `L'IA n'a pas retourné exactement 3 variantes (reçu : ${Array.isArray(rawVariants) ? rawVariants.length : 0}). Réessaie.`,
    );
  }

  const variants = rawVariants.map((v, i) => sanitizeOneVariant(v, i));

  // Garde-fou "réellement différentes" : rejette 3 variantes strictement
  // identiques en nom (l'IA aurait généré 3 copies au lieu de 3 propositions).
  const uniqueNames = new Set(variants.map((v) => v.name.toLowerCase()));
  if (uniqueNames.size === 1) {
    throw new RecipeVariantError("ai_error", "Les 3 variantes générées ne sont pas suffisamment différentes. Réessaie.");
  }

  return variants;
}
