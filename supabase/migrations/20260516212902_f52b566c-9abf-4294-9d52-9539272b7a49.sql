
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS base_calories integer,
  ADD COLUMN IF NOT EXISTS base_proteins double precision,
  ADD COLUMN IF NOT EXISTS base_carbs double precision,
  ADD COLUMN IF NOT EXISTS base_fats double precision,
  ADD COLUMN IF NOT EXISTS serving_count double precision DEFAULT 1,
  ADD COLUMN IF NOT EXISTS percentage_consumed double precision DEFAULT 100;
