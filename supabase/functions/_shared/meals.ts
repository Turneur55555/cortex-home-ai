// Source unique des slugs de repas côté Edge Functions — miroir de
// src/lib/nutrition/meals.ts (impossible à importer tel quel depuis Deno)
// et alignée sur la contrainte CHECK nutrition_meal_check en base.
export const MEAL_SLUGS = ["petit-dej", "dejeuner", "gouter", "diner", "collation"] as const;
export type MealSlug = (typeof MEAL_SLUGS)[number];

export function isMealSlug(v: string | null | undefined): v is MealSlug {
  return v != null && (MEAL_SLUGS as readonly string[]).includes(v);
}
