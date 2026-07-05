/**
 * Recettes — domaine pur (zéro React, zéro couleur).
 *
 * Agrège les macros d'une recette à partir de ses ingrédients. Les macros d'un
 * ingrédient proviennent de la table `items` (champs *_per_100g) et de la masse
 * normalisée `grams` de la ligne recipe_ingredients.
 */

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface IngredientMacroInput {
  /** Masse normalisée de l'ingrédient (g). null/0 -> contribution nulle. */
  grams: number | null | undefined;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
}

const num = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export const EMPTY_MACROS: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** Macros d'un seul ingrédient (per_100g × grams / 100). */
function ingredientMacros(input: IngredientMacroInput): MacroTotals {
  const g = num(input.grams);
  if (g === 0) return { ...EMPTY_MACROS };
  const f = g / 100;
  return {
    calories: r1(num(input.caloriesPer100g) * f),
    protein: r1(num(input.proteinPer100g) * f),
    carbs: r1(num(input.carbsPer100g) * f),
    fat: r1(num(input.fatPer100g) * f),
  };
}

/** Somme des macros de tous les ingrédients d'une recette (total recette). */
export function recipeMacros(ingredients: ReadonlyArray<IngredientMacroInput> | null | undefined): MacroTotals {
  if (!ingredients || ingredients.length === 0) return { ...EMPTY_MACROS };
  const total = ingredients.reduce<MacroTotals>((acc, ing) => {
    const m = ingredientMacros(ing);
    acc.calories += m.calories;
    acc.protein += m.protein;
    acc.carbs += m.carbs;
    acc.fat += m.fat;
    return acc;
  }, { ...EMPTY_MACROS });
  return { calories: r1(total.calories), protein: r1(total.protein), carbs: r1(total.carbs), fat: r1(total.fat) };
}

/** Macros par portion : total / nombre de portions. */
export function perServing(total: MacroTotals, servings: number | null | undefined): MacroTotals {
  const s = num(servings);
  if (s === 0) return { ...total };
  return {
    calories: r1(total.calories / s),
    protein: r1(total.protein / s),
    carbs: r1(total.carbs / s),
    fat: r1(total.fat / s),
  };
}

/** Macros d'un nombre arbitraire de portions consommées (ex. planning repas). */
export function scaleServings(perServingMacros: MacroTotals, servings: number | null | undefined): MacroTotals {
  const s = num(servings);
  return {
    calories: r1(perServingMacros.calories * s),
    protein: r1(perServingMacros.protein * s),
    carbs: r1(perServingMacros.carbs * s),
    fat: r1(perServingMacros.fat * s),
  };
}
