CREATE TABLE IF NOT EXISTS public.nutrition_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) <= 200),
  meal text CHECK (meal = ANY (ARRAY['petit-dej','petit-dejeuner','dejeuner','diner','collation'])),
  calories integer CHECK (calories IS NULL OR (calories >= 0 AND calories <= 10000)),
  proteins double precision CHECK (proteins IS NULL OR (proteins >= 0 AND proteins <= 1000)),
  carbs double precision CHECK (carbs IS NULL OR (carbs >= 0 AND carbs <= 1000)),
  fats double precision CHECK (fats IS NULL OR (fats >= 0 AND fats <= 1000)),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_select_own" ON public.nutrition_favorites;
CREATE POLICY "fav_select_own" ON public.nutrition_favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fav_insert_own" ON public.nutrition_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fav_delete_own" ON public.nutrition_favorites
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_favorites_user ON public.nutrition_favorites(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
