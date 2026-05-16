-- Nutritional enrichment columns + low-stock threshold on items

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS calories_per_100g float,
  ADD COLUMN IF NOT EXISTS protein_per_100g  float,
  ADD COLUMN IF NOT EXISTS carbs_per_100g    float,
  ADD COLUMN IF NOT EXISTS fat_per_100g      float,
  ADD COLUMN IF NOT EXISTS barcode           text,
  ADD COLUMN IF NOT EXISTS brand             text,
  ADD COLUMN IF NOT EXISTS image_url         text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold float;

-- Shopping list

CREATE TABLE IF NOT EXISTS public.shopping_list (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name      text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  quantity  float,
  unit      text,
  item_id   uuid        REFERENCES public.items(id) ON DELETE SET NULL,
  added_at  timestamptz NOT NULL DEFAULT now(),
  done      boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shopping list"
  ON public.shopping_list FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_shopping_list_user
  ON public.shopping_list (user_id, added_at DESC);
