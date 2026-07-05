
-- 1) Index sur clés étrangères manquantes (tables cortex)
CREATE INDEX IF NOT EXISTS idx_food_custom_foods_food_id ON public.food_custom_foods(food_id);
CREATE INDEX IF NOT EXISTS idx_food_favorites_food_id ON public.food_favorites(food_id);
CREATE INDEX IF NOT EXISTS idx_food_search_history_food_id ON public.food_search_history(food_id);
CREATE INDEX IF NOT EXISTS idx_food_synonyms_food_id ON public.food_synonyms(food_id);
CREATE INDEX IF NOT EXISTS idx_program_sessions_program_id ON public.program_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food_id ON public.recipe_ingredients(food_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_food_id ON public.saved_meal_items(food_id);

-- 2) Suppression des index strictement dupliqués (on garde la version contrainte/unique)
DROP INDEX IF EXISTS public.idx_foods_category;
DROP INDEX IF EXISTS public.idx_foods_normname_trgm;
DROP INDEX IF EXISTS public.idx_weekly_reports_user_week;
DROP INDEX IF EXISTS public.idx_user_exercise_illustrations_user;
DROP INDEX IF EXISTS public.ai_cache_key_idx;
DROP INDEX IF EXISTS public.idx_error_logs_support;

-- 3) Policy permissive redondante sur recipes (recipes_modify_own la couvre déjà)
DROP POLICY IF EXISTS "Users manage own recipes" ON public.recipes;

-- 4) Durcissement fonctions SECURITY DEFINER exposées
-- Fonction trigger : ne doit jamais être appelable en RPC
REVOKE EXECUTE ON FUNCTION public.trg_recipe_ing_recompute() FROM anon, authenticated, public;
-- Recalcul nutrition : réservé aux utilisateurs connectés
REVOKE EXECUTE ON FUNCTION public.recompute_recipe_nutrition(uuid) FROM anon, public;
-- Déblocage de badge : jamais en anonyme
REVOKE EXECUTE ON FUNCTION public.unlock_user_badge(text) FROM anon, public;
