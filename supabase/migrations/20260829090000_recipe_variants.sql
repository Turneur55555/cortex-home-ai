-- Variantes de recette IA ("Proposer des variantes", module Recettes).
-- Additive uniquement, réutilise `recipes`/`recipe_ingredients` (Nutrition V2) :
-- une variante enregistrée est une recette indépendante à part entière (jamais
-- de modification de la recette originale), avec juste une référence vers sa
-- recette source pour l'affichage ("dérivée de ...").

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS source_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.recipes.source_recipe_id IS
  'Recette d''origine si cette recette est une variante générée par IA (module "Proposer des variantes") — NULL sinon. Ne crée jamais de dépendance de calcul : chaque recette garde son propre snapshot per_serving_*.';

CREATE INDEX IF NOT EXISTS idx_recipes_source_recipe_id ON public.recipes(source_recipe_id) WHERE source_recipe_id IS NOT NULL;

-- Nouvelle action de rate-limit pour l'edge function recipe-variants.
ALTER TABLE public.rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image',
    'food_lookup', 'analyze_exercise', 'verify_exercise_rank',
    'nutrition_health_insight', 'analyze_wardrobe_item',
    'estimate_body_fat_photo', 'recipe_import', 'recipe_variants'
  ]));
