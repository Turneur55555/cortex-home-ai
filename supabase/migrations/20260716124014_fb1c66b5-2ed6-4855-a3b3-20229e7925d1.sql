-- Allow 5 meal slugs (petit-dej, dejeuner, gouter, diner, collation)
-- Keep legacy 'petit-dejeuner' for backward compat.
ALTER TABLE public.nutrition DROP CONSTRAINT IF EXISTS nutrition_meal_check;
ALTER TABLE public.nutrition ADD CONSTRAINT nutrition_meal_check
  CHECK (meal = ANY (ARRAY['petit-dej'::text, 'petit-dejeuner'::text, 'dejeuner'::text, 'gouter'::text, 'diner'::text, 'collation'::text]));