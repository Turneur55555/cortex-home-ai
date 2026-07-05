ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS consumed_grams_per_unit double precision;
COMMENT ON COLUMN public.nutrition.consumed_grams_per_unit IS
  'Grammes pour 1 unité de consumed_unit (1 pour g/ml). consumed_quantity est en unités de consumed_unit. base_* = valeurs pour 100 g. (A, 26/06/2026)';
