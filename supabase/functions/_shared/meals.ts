// SOURCE UNIQUE ET CANONIQUE des slugs de repas — alignée sur la contrainte
// CHECK nutrition_meal_check en base (voir supabase/migrations/*meal_check*.sql).
//
// Ce fichier est importé :
//   - directement par les Edge Functions Deno (import relatif "../_shared/meals.ts")
//   - par le frontend via src/lib/nutrition/meals.ts, qui réexporte MEAL_SLUGS/
//     MealSlug/isMealSlug depuis CE fichier (import relatif inter-dossiers,
//     permis par `allowImportingTsExtensions` dans tsconfig.json) et y ajoute
//     les libellés FR et les helpers UI (MEAL_LABELS, MEAL_OPTIONS, clampMacroSet…).
//
// Ne JAMAIS dupliquer cette liste ailleurs — voir docs/architecture/nutrition-meal-slugs.md
// pour la procédure d'ajout d'un repas. `npm test` (meals.sync.test.ts) échoue
// si cette liste et la contrainte SQL divergent, et si une liste dupliquée
// réapparaît ailleurs dans le repo.
export const MEAL_SLUGS = ["petit-dej", "dejeuner", "gouter", "diner", "collation"] as const;
export type MealSlug = (typeof MEAL_SLUGS)[number];

export function isMealSlug(v: string | null | undefined): v is MealSlug {
  return v != null && (MEAL_SLUGS as readonly string[]).includes(v);
}
