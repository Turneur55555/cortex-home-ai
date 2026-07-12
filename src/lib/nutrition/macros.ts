// Calculs nutritionnels purs — zéro import React

/** Nutriments bruts pour 100 g/ml fournis par le catalogue (USDA/Supabase) */
export interface ProductNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  "energy-kcal_serving"?: number;
  proteins_serving?: number;
  carbohydrates_serving?: number;
  fat_serving?: number;
}

/** Valeurs macros calculées pour une quantité donnée */
export type MacroValues = {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
};

/**
 * Calcule les macros pour une quantité donnée à partir des valeurs pour 100 g/ml.
 *
 * @param nutriments - Données nutriments issues du catalogue (USDA/Supabase)
 * @param totalQty   - Quantité totale consommée (en g ou ml)
 * @returns MacroValues avec calories arrondies à l'entier, macros arrondi au dixième
 */
export function computeMacros(
  nutriments: ProductNutriments | undefined,
  totalQty: number,
): MacroValues {
  const r = (v: number | undefined | null) =>
    v != null ? Math.round((v * totalQty) / 100) : null;
  const r1 = (v: number | undefined | null) =>
    v != null ? Math.round(((v * totalQty) / 100) * 10) / 10 : null;
  return {
    calories: r(nutriments?.["energy-kcal_100g"]),
    proteins: r1(nutriments?.proteins_100g),
    carbs:    r1(nutriments?.carbohydrates_100g),
    fats:     r1(nutriments?.fat_100g),
    fiber: r1(nutriments?.fiber_100g),
  };
}
