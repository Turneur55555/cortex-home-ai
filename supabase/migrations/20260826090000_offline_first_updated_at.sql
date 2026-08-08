-- Offline-first (architecture globale, cf. CLAUDE.md) : le conflict detector
-- a besoin d'un `updated_at` fiable, tenu à jour serveur-side, sur chaque
-- table pouvant être modifiée hors-ligne puis resynchronisée. Plusieurs
-- tables du module Nutrition/Recettes ne l'avaient jamais eu (créées avant
-- cette exigence, ou en rattrapage hors migrations — cf.
-- 20260702202410_nutrition_catchup_saved_meals_favorites.sql).
--
-- Réutilise `public.set_updated_at()` (trigger générique déjà en place,
-- cf. 20260612153101_create_user_preferences_table.sql /
-- 20260814090000_physical_goals.sql) — pas de nouvelle fonction dupliquée.
-- Migration strictement additive et idempotente.

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ─── nutrition ──────────────────────────────────────────────────────────
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_nutrition_updated_at ON public.nutrition;
CREATE TRIGGER trg_nutrition_updated_at BEFORE UPDATE ON public.nutrition
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── nutrition_favorites ────────────────────────────────────────────────
ALTER TABLE public.nutrition_favorites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_nutrition_favorites_updated_at ON public.nutrition_favorites;
CREATE TRIGGER trg_nutrition_favorites_updated_at BEFORE UPDATE ON public.nutrition_favorites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── recipe_ingredients ─────────────────────────────────────────────────
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_recipe_ingredients_updated_at ON public.recipe_ingredients;
CREATE TRIGGER trg_recipe_ingredients_updated_at BEFORE UPDATE ON public.recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── shopping_list ──────────────────────────────────────────────────────
ALTER TABLE public.shopping_list
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_shopping_list_updated_at ON public.shopping_list;
CREATE TRIGGER trg_shopping_list_updated_at BEFORE UPDATE ON public.shopping_list
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── meal_plans ─────────────────────────────────────────────────────────
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER trg_meal_plans_updated_at BEFORE UPDATE ON public.meal_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
