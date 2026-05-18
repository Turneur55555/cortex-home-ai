
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS consumed_unit text;
