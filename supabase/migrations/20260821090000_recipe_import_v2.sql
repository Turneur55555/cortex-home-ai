-- V2 import de recettes (Instagram) : persistance de la fiche générée par IA.
-- Additive uniquement, réutilise les tables Nutrition V2 existantes
-- (recipes / recipe_ingredients, migration 20260613223921).
--
-- Les recettes créées manuellement dérivent toujours leurs macros via
-- lib/nutrition/recipes.ts (recipeMacros — jointure recipe_ingredients.item_id
-- -> items.*_per_100g). Une recette IMPORTÉE n'a pas d'ingrédient fiablement
-- lié au catalogue `items` (noms libres extraits d'une vidéo/photo) : ses
-- macros par portion sont donc figées au moment de l'import dans les colonnes
-- per_serving_* ci-dessous — un snapshot, pas une valeur recalculée.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_image_url text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS per_serving_calories numeric,
  ADD COLUMN IF NOT EXISTS per_serving_proteins numeric,
  ADD COLUMN IF NOT EXISTS per_serving_carbs numeric,
  ADD COLUMN IF NOT EXISTS per_serving_fats numeric,
  ADD COLUMN IF NOT EXISTS per_serving_fiber numeric;

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_confidence_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_confidence_check
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_per_serving_nonneg_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_per_serving_nonneg_check
  CHECK (
    (per_serving_calories IS NULL OR per_serving_calories >= 0) AND
    (per_serving_proteins IS NULL OR per_serving_proteins >= 0) AND
    (per_serving_carbs IS NULL OR per_serving_carbs >= 0) AND
    (per_serving_fats IS NULL OR per_serving_fats >= 0) AND
    (per_serving_fiber IS NULL OR per_serving_fiber >= 0)
  );

COMMENT ON COLUMN public.recipes.source_kind IS
  'Source d''import (instagram, tiktok, ...) — NULL pour une recette créée manuellement.';
COMMENT ON COLUMN public.recipes.per_serving_calories IS
  'Snapshot macros/portion figé à l''import IA (recipe_ingredients n''a pas de item_id fiable pour une recette importée) — recipeMacros() reste la source pour les recettes manuelles liées à items.';

-- Dédoublonnage : un même utilisateur ne réimporte pas 2x le même lien source
-- (l'edge function recipe-import réutilise la recette existante à la place).
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_user_source_url
  ON public.recipes(user_id, source_url) WHERE source_url IS NOT NULL;

-- Lien recette -> entrée du journal nutritionnel : "Ajouter au journal"
-- réutilise la recette déjà créée plutôt que de dupliquer ses données.
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nutrition_recipe ON public.nutrition(recipe_id);

-- Nouvelle action de rate-limit pour l'edge function recipe-import.
ALTER TABLE public.rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image',
    'food_lookup', 'analyze_exercise', 'verify_exercise_rank',
    'nutrition_health_insight', 'analyze_wardrobe_item',
    'estimate_body_fat_photo', 'recipe_import'
  ]));
