
-- Extension trigram pour recherche floue
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────── foods (catalogue canonique) ───────────
CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('usda', 'icortex', 'custom')),
  source_id TEXT,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  -- macros pour 100g
  calories NUMERIC,
  proteins NUMERIC,
  carbs NUMERIC,
  fats NUMERIC,
  fiber NUMERIC,
  sugar NUMERIC,
  saturated_fat NUMERIC,
  sodium NUMERIC,
  micros JSONB DEFAULT '{}'::jsonb,
  image_url TEXT,
  language TEXT DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS foods_name_trgm_idx ON public.foods USING gin (name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS foods_brand_idx ON public.foods (brand);
CREATE INDEX IF NOT EXISTS foods_category_idx ON public.foods (category);

GRANT SELECT ON public.foods TO authenticated;
GRANT ALL ON public.foods TO service_role;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "foods readable by authenticated" ON public.foods;
CREATE POLICY "foods readable by authenticated" ON public.foods
  FOR SELECT TO authenticated USING (true);

-- ─────────── food_barcodes ───────────
CREATE TABLE IF NOT EXISTS public.food_barcodes (
  barcode TEXT PRIMARY KEY,
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_barcodes_food_idx ON public.food_barcodes (food_id);

GRANT SELECT ON public.food_barcodes TO authenticated;
GRANT ALL ON public.food_barcodes TO service_role;
ALTER TABLE public.food_barcodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "barcodes readable by authenticated" ON public.food_barcodes;
CREATE POLICY "barcodes readable by authenticated" ON public.food_barcodes
  FOR SELECT TO authenticated USING (true);

-- ─────────── food_synonyms (correction / alias) ───────────
CREATE TABLE IF NOT EXISTS public.food_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  food_id UUID REFERENCES public.foods(id) ON DELETE CASCADE,
  canonical_term TEXT,
  language TEXT DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_synonyms_alias_trgm_idx ON public.food_synonyms USING gin (alias_normalized gin_trgm_ops);

GRANT SELECT ON public.food_synonyms TO authenticated;
GRANT ALL ON public.food_synonyms TO service_role;
ALTER TABLE public.food_synonyms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "synonyms readable by authenticated" ON public.food_synonyms;
CREATE POLICY "synonyms readable by authenticated" ON public.food_synonyms
  FOR SELECT TO authenticated USING (true);

-- ─────────── food_servings (portions standard) ───────────
CREATE TABLE IF NOT EXISTS public.food_servings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  grams NUMERIC NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_servings_food_idx ON public.food_servings (food_id);

GRANT SELECT ON public.food_servings TO authenticated;
GRANT ALL ON public.food_servings TO service_role;
ALTER TABLE public.food_servings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servings readable by authenticated" ON public.food_servings
  FOR SELECT TO authenticated USING (true);

-- ─────────── food_quality_scores ───────────
CREATE TABLE IF NOT EXISTS public.food_quality_scores (
  food_id UUID PRIMARY KEY REFERENCES public.foods(id) ON DELETE CASCADE,
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  kcal_theoretical NUMERIC,
  kcal_declared NUMERIC,
  kcal_delta_pct NUMERIC,
  flags JSONB DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.food_quality_scores TO authenticated;
GRANT ALL ON public.food_quality_scores TO service_role;
ALTER TABLE public.food_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality readable by authenticated" ON public.food_quality_scores
  FOR SELECT TO authenticated USING (true);

-- ─────────── food_search_history (per-user) ───────────
CREATE TABLE IF NOT EXISTS public.food_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_search_history_user_idx ON public.food_search_history (user_id, last_used_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS food_search_history_user_food_idx ON public.food_search_history (user_id, food_id) WHERE food_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_search_history TO authenticated;
GRANT ALL ON public.food_search_history TO service_role;
ALTER TABLE public.food_search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own search history" ON public.food_search_history
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────── food_favorites (per-user) ───────────
CREATE TABLE IF NOT EXISTS public.food_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, food_id)
);
CREATE INDEX IF NOT EXISTS food_favorites_user_idx ON public.food_favorites (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_favorites TO authenticated;
GRANT ALL ON public.food_favorites TO service_role;
ALTER TABLE public.food_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own favorites" ON public.food_favorites
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────── food_custom_foods (per-user) ───────────
CREATE TABLE IF NOT EXISTS public.food_custom_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand TEXT,
  calories NUMERIC,
  proteins NUMERIC,
  carbs NUMERIC,
  fats NUMERIC,
  default_serving_grams NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_custom_foods_user_idx ON public.food_custom_foods (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_custom_foods TO authenticated;
GRANT ALL ON public.food_custom_foods TO service_role;
ALTER TABLE public.food_custom_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own custom foods" ON public.food_custom_foods
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────── triggers updated_at ───────────
DROP TRIGGER IF EXISTS foods_touch_updated_at ON public.foods;
CREATE TRIGGER foods_touch_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS food_custom_foods_touch_updated_at ON public.food_custom_foods;
CREATE TRIGGER food_custom_foods_touch_updated_at
  BEFORE UPDATE ON public.food_custom_foods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
