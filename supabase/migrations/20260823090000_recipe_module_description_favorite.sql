-- Module "Recettes" (Nutrition) : la fiche recette importée devient une
-- vraie recette persistée, plus un simple aller-retour vers le journal.
--
-- 1) `source_description` : légende/description ORIGINALE du post source
--    (og:description Instagram), distincte de `notes` (les hypothèses de
--    l'IA sur la fiche). Ajoutée aussi sur `recipe_import_cache` pour que le
--    cache global porte la même donnée que la recette qu'il alimente.
-- 2) `is_favorite` : bascule simple sur `recipes`, consommée par le nouvel
--    écran "Mes recettes" (RecipesListSheet/RecipeDetailSheet).

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS source_description text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

ALTER TABLE public.recipe_import_cache
  ADD COLUMN IF NOT EXISTS source_description text;

CREATE INDEX IF NOT EXISTS idx_recipes_user_favorite
  ON public.recipes(user_id, is_favorite) WHERE is_favorite;
