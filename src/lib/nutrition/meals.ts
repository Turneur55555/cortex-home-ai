// Repas — constantes et helpers partagés (zéro React).
// Source unique des slugs/labels de repas et des bornes de validation,
// alignées sur les contraintes CHECK de la table `nutrition`.

export const MEAL_SLUGS = ["petit-dej", "dejeuner", "diner", "collation"] as const;
export type MealSlug = (typeof MEAL_SLUGS)[number];

export const MEAL_LABELS: Record<MealSlug, string> = {
  "petit-dej": "Petit-déjeuner",
  dejeuner: "Déjeuner",
  diner: "Dîner",
  collation: "Collation",
};

export function isMealSlug(v: string | null | undefined): v is MealSlug {
  return v != null && (MEAL_SLUGS as readonly string[]).includes(v);
}

/** Macros pour `grams` g à partir d'une valeur /100 g (arrondi 0,1 g). */
export const scalePer100 = (v: number | null, grams: number): number | null =>
  v == null ? null : Math.round(((v * grams) / 100) * 10) / 10;

/** Valeur /100 g à partir d'un total mesuré sur `grams` g (inverse de scalePer100). */
export const per100FromTotal = (total: number | null, grams: number): number | null =>
  total == null || grams <= 0 ? null : Math.round(((total * 100) / grams) * 10) / 10;

// Bornes DB (contraintes CHECK de public.nutrition).
export const MAX_CALORIES = 10000;
export const MAX_MACRO = 1000;

export interface MacroSet {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

/** Borne un set de macros aux contraintes DB (≥ 0, kcal ≤ 10000, macros ≤ 1000 g). */
export function clampMacroSet(m: MacroSet): MacroSet {
  const safe = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  return {
    calories: Math.min(MAX_CALORIES, safe(m.calories)),
    proteins: Math.min(MAX_MACRO, safe(m.proteins)),
    carbs: Math.min(MAX_MACRO, safe(m.carbs)),
    fats: Math.min(MAX_MACRO, safe(m.fats)),
  };
}
