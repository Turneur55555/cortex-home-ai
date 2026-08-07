-- Fiche recette premium (module "Recettes") : résumé IA, auteur Instagram,
-- temps de cuisson, historique de réanalyse. `recipes.tags` (text[]) et
-- `recipes.prep_minutes` existent déjà depuis la migration Nutrition V2
-- initiale (20260613223921) et sont réutilisés tels quels — pas de
-- redéfinition ici.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS source_author text,
  ADD COLUMN IF NOT EXISTS cook_minutes smallint,
  ADD COLUMN IF NOT EXISTS last_reanalyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reanalysis_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_cook_minutes_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_cook_minutes_check CHECK (cook_minutes IS NULL OR cook_minutes >= 0);

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_reanalysis_count_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_reanalysis_count_check CHECK (reanalysis_count >= 0);

-- Le cache global doit porter les mêmes champs enrichis que ce qu'il
-- alimente (une copie DB pure vers `recipes` sur cache hit doit pouvoir
-- transporter résumé/auteur/temps de cuisson sans re-analyse IA).
ALTER TABLE public.recipe_import_cache
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS source_author text,
  ADD COLUMN IF NOT EXISTS prep_minutes smallint,
  ADD COLUMN IF NOT EXISTS cook_minutes smallint,
  ADD COLUMN IF NOT EXISTS tags text[];

ALTER TABLE public.recipe_import_cache
  DROP CONSTRAINT IF EXISTS recipe_import_cache_prep_minutes_check;
ALTER TABLE public.recipe_import_cache
  ADD CONSTRAINT recipe_import_cache_prep_minutes_check CHECK (prep_minutes IS NULL OR prep_minutes >= 0);

ALTER TABLE public.recipe_import_cache
  DROP CONSTRAINT IF EXISTS recipe_import_cache_cook_minutes_check;
ALTER TABLE public.recipe_import_cache
  ADD CONSTRAINT recipe_import_cache_cook_minutes_check CHECK (cook_minutes IS NULL OR cook_minutes >= 0);
