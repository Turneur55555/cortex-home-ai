-- Bug critique : l'app envoie meal='petit-dej' mais la contrainte exigeait 'petit-dejeuner'
-- => toute insertion de repas "Petit-déjeuner" (valeur par défaut du formulaire) échouait (code 23514).
-- On aligne la contrainte sur le vocabulaire du frontend (petit-dej), en tolérant aussi l'ancien slug.
ALTER TABLE public.nutrition DROP CONSTRAINT IF EXISTS nutrition_meal_check;
ALTER TABLE public.nutrition ADD CONSTRAINT nutrition_meal_check
  CHECK (meal = ANY (ARRAY['petit-dej'::text, 'petit-dejeuner'::text, 'dejeuner'::text, 'diner'::text, 'collation'::text]));
NOTIFY pgrst, 'reload schema';
