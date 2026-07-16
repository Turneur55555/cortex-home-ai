// Repas — constantes et helpers partagés (zéro React).
// Les slugs de repas (MEAL_SLUGS/MealSlug/isMealSlug) NE SONT PAS définis ici :
// ce fichier les réexporte depuis la source unique et canonique côté Edge
// Functions (supabase/functions/_shared/meals.ts), pour qu'il n'existe qu'UNE
// seule liste dans tout le repo — voir docs/architecture/nutrition-meal-slugs.md.
export {
  MEAL_SLUGS,
  isMealSlug,
  type MealSlug,
} from "../../../supabase/functions/_shared/meals.ts";
import { MEAL_SLUGS, type MealSlug } from "../../../supabase/functions/_shared/meals.ts";

export const MEAL_LABELS: Record<MealSlug, string> = {
  "petit-dej": "Petit-déjeuner",
  dejeuner: "Déjeuner",
  gouter: "Goûter",
  diner: "Dîner",
  collation: "Collation",
};

/** Options d'un <select> repas — dérivées de la source de vérité unique. */
export const MEAL_OPTIONS: ReadonlyArray<{ value: MealSlug; label: string }> = MEAL_SLUGS.map(
  (slug) => ({ value: slug, label: MEAL_LABELS[slug] }),
);

/** Macros pour `grams` g à partir d'une valeur /100 g (arrondi 0,1 g). */
export const scalePer100 = (v: number | null, grams: number): number | null =>
  v == null ? null : Math.round(((v * grams) / 100) * 10) / 10;

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
