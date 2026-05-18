
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS consumed_quantity double precision;
