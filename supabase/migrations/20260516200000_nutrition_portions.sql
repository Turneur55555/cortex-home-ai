-- Ajout des colonnes de portions à la table nutrition
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS consumed_quantity    float,
  ADD COLUMN IF NOT EXISTS consumed_unit        text,
  ADD COLUMN IF NOT EXISTS serving_count        float DEFAULT 1,
  ADD COLUMN IF NOT EXISTS percentage_consumed  float DEFAULT 100,
  ADD COLUMN IF NOT EXISTS base_calories        float,
  ADD COLUMN IF NOT EXISTS base_proteins        float,
  ADD COLUMN IF NOT EXISTS base_carbs           float,
  ADD COLUMN IF NOT EXISTS base_fats            float;

-- Backfill : les enregistrements existants = 100% consommé, 1 portion
UPDATE public.nutrition
SET
  base_calories       = calories,
  base_proteins       = proteins,
  base_carbs          = carbs,
  base_fats           = fats,
  percentage_consumed = 100,
  serving_count       = 1
WHERE base_calories IS NULL;
