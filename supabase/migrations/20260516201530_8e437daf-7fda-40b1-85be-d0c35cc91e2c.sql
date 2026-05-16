CREATE TABLE IF NOT EXISTS public.home_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.home_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.home_categories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  icon text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_home_categories_user ON public.home_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_home_subcategories_user ON public.home_subcategories(user_id);
CREATE INDEX IF NOT EXISTS idx_home_subcategories_category ON public.home_subcategories(category_id);

ALTER TABLE public.home_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own categories"
ON public.home_categories
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own subcategories"
ON public.home_subcategories
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);