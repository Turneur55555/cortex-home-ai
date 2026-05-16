-- ─── home_categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'Box',
  color       text        NOT NULL DEFAULT '#6366f1',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

ALTER TABLE public.home_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hc_select" ON public.home_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hc_insert" ON public.home_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hc_update" ON public.home_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "hc_delete" ON public.home_categories FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_home_categories_user
  ON public.home_categories (user_id, position);

-- ─── home_subcategories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_subcategories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.home_categories(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'Box',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

ALTER TABLE public.home_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hs_select" ON public.home_subcategories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hs_insert" ON public.home_subcategories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hs_update" ON public.home_subcategories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "hs_delete" ON public.home_subcategories FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_home_subcategories_category
  ON public.home_subcategories (category_id, position);

-- ─── Seed function (trigger pour nouveaux utilisateurs) ───────────────────────
CREATE OR REPLACE FUNCTION public.seed_default_home_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuisine_id    uuid;
  v_sdb_id        uuid;
  v_chambre_id    uuid;
  v_salon_id      uuid;
  v_dressing_id   uuid;
  v_bureau_id     uuid;
BEGIN
  INSERT INTO public.home_categories (user_id, name, slug, icon, color, position)
  VALUES
    (NEW.id, 'Cuisine',       'cuisine',       'ChefHat',  '#f97316', 0),
    (NEW.id, 'Salle de bain', 'salle-de-bain', 'Bath',     '#06b6d4', 1),
    (NEW.id, 'Chambre',       'chambre',       'Bed',      '#8b5cf6', 2),
    (NEW.id, 'Salon',         'salon',         'Sofa',     '#10b981', 3),
    (NEW.id, 'Dressing',      'dressing',      'Shirt',    '#f59e0b', 4),
    (NEW.id, 'Bureau',        'bureau',        'Monitor',  '#6366f1', 5),
    (NEW.id, 'Entrée',        'entree',        'DoorOpen', '#eab308', 6),
    (NEW.id, 'Buanderie',     'buanderie',     'WashingMachine', '#0ea5e9', 7),
    (NEW.id, 'Cave',          'cave',          'Archive',  '#78716c', 8),
    (NEW.id, 'Garage',        'garage',        'Car',      '#64748b', 9),
    (NEW.id, 'Balcon',        'balcon',        'TreePine', '#22c55e', 10)
  ON CONFLICT (user_id, slug) DO NOTHING;

  -- Sous-catégories Cuisine
  SELECT id INTO v_cuisine_id FROM public.home_categories
  WHERE user_id = NEW.id AND slug = 'cuisine';

  IF v_cuisine_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_cuisine_id, NEW.id, 'Frigo',         'frigo',           'Refrigerator', 0),
      (v_cuisine_id, NEW.id, 'Congélateur',   'congelateur',     'Snowflake',    1),
      (v_cuisine_id, NEW.id, 'Placards',      'placard',         'Package',      2),
      (v_cuisine_id, NEW.id, 'Épices',        'epices',          'Leaf',         3),
      (v_cuisine_id, NEW.id, 'Tiroirs',       'tiroirs',         'Layers',       4),
      (v_cuisine_id, NEW.id, 'Meuble haut',   'meuble-haut',     'Box',          5),
      (v_cuisine_id, NEW.id, 'Meuble bas',    'meuble-bas',      'Box',          6)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  -- Sous-catégories Salle de bain
  SELECT id INTO v_sdb_id FROM public.home_categories
  WHERE user_id = NEW.id AND slug = 'salle-de-bain';

  IF v_sdb_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_sdb_id, NEW.id, 'Armoire pharmacie', 'armoire-pharmacie', 'Shield',   0),
      (v_sdb_id, NEW.id, 'Douche',            'douche',            'Droplets', 1),
      (v_sdb_id, NEW.id, 'Lavabo',            'lavabo',            'Droplet',  2),
      (v_sdb_id, NEW.id, 'Produits visage',   'produits-visage',   'Sparkles', 3),
      (v_sdb_id, NEW.id, 'Produits corps',    'produits-corps',    'Heart',    4),
      (v_sdb_id, NEW.id, 'Serviettes',        'serviettes',        'Wind',     5)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  -- Sous-catégories Chambre
  SELECT id INTO v_chambre_id FROM public.home_categories
  WHERE user_id = NEW.id AND slug = 'chambre';

  IF v_chambre_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_chambre_id, NEW.id, 'Table de nuit', 'table-nuit', 'Moon',     0),
      (v_chambre_id, NEW.id, 'Armoire',       'armoire',    'Package',  1),
      (v_chambre_id, NEW.id, 'Commode',       'commode',    'Layers',   2),
      (v_chambre_id, NEW.id, 'Sous le lit',   'sous-lit',   'Box',      3),
      (v_chambre_id, NEW.id, 'Skincare',      'skincare',   'Sparkles', 4)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_home_categories ON auth.users;
CREATE TRIGGER on_auth_user_created_home_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_home_categories();

-- ─── Seed des utilisateurs existants ─────────────────────────────────────────
DO $$
DECLARE
  u record;
  v_cuisine_id uuid;
  v_sdb_id     uuid;
  v_chambre_id uuid;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    INSERT INTO public.home_categories (user_id, name, slug, icon, color, position)
    VALUES
      (u.id, 'Cuisine',       'cuisine',       'ChefHat',        '#f97316', 0),
      (u.id, 'Salle de bain', 'salle-de-bain', 'Bath',           '#06b6d4', 1),
      (u.id, 'Chambre',       'chambre',       'Bed',            '#8b5cf6', 2),
      (u.id, 'Salon',         'salon',         'Sofa',           '#10b981', 3),
      (u.id, 'Dressing',      'dressing',      'Shirt',          '#f59e0b', 4),
      (u.id, 'Bureau',        'bureau',        'Monitor',        '#6366f1', 5),
      (u.id, 'Entrée',        'entree',        'DoorOpen',       '#eab308', 6),
      (u.id, 'Buanderie',     'buanderie',     'WashingMachine', '#0ea5e9', 7),
      (u.id, 'Cave',          'cave',          'Archive',        '#78716c', 8),
      (u.id, 'Garage',        'garage',        'Car',            '#64748b', 9),
      (u.id, 'Balcon',        'balcon',        'TreePine',       '#22c55e', 10)
    ON CONFLICT (user_id, slug) DO NOTHING;

    -- Sous-catégories Cuisine
    SELECT id INTO v_cuisine_id FROM public.home_categories WHERE user_id = u.id AND slug = 'cuisine';
    IF v_cuisine_id IS NOT NULL THEN
      INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
      VALUES
        (v_cuisine_id, u.id, 'Frigo',       'frigo',       'Refrigerator', 0),
        (v_cuisine_id, u.id, 'Congélateur', 'congelateur', 'Snowflake',    1),
        (v_cuisine_id, u.id, 'Placards',    'placard',     'Package',      2),
        (v_cuisine_id, u.id, 'Épices',      'epices',      'Leaf',         3),
        (v_cuisine_id, u.id, 'Tiroirs',     'tiroirs',     'Layers',       4),
        (v_cuisine_id, u.id, 'Meuble haut', 'meuble-haut', 'Box',          5),
        (v_cuisine_id, u.id, 'Meuble bas',  'meuble-bas',  'Box',          6)
      ON CONFLICT (category_id, slug) DO NOTHING;
    END IF;

    -- Sous-catégories Salle de bain
    SELECT id INTO v_sdb_id FROM public.home_categories WHERE user_id = u.id AND slug = 'salle-de-bain';
    IF v_sdb_id IS NOT NULL THEN
      INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
      VALUES
        (v_sdb_id, u.id, 'Armoire pharmacie', 'armoire-pharmacie', 'Shield',   0),
        (v_sdb_id, u.id, 'Douche',            'douche',            'Droplets', 1),
        (v_sdb_id, u.id, 'Lavabo',            'lavabo',            'Droplet',  2),
        (v_sdb_id, u.id, 'Produits visage',   'produits-visage',   'Sparkles', 3),
        (v_sdb_id, u.id, 'Produits corps',    'produits-corps',    'Heart',    4),
        (v_sdb_id, u.id, 'Serviettes',        'serviettes',        'Wind',     5)
      ON CONFLICT (category_id, slug) DO NOTHING;
    END IF;

    -- Sous-catégories Chambre
    SELECT id INTO v_chambre_id FROM public.home_categories WHERE user_id = u.id AND slug = 'chambre';
    IF v_chambre_id IS NOT NULL THEN
      INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
      VALUES
        (v_chambre_id, u.id, 'Table de nuit', 'table-nuit', 'Moon',     0),
        (v_chambre_id, u.id, 'Armoire',       'armoire',    'Package',  1),
        (v_chambre_id, u.id, 'Commode',       'commode',    'Layers',   2),
        (v_chambre_id, u.id, 'Sous le lit',   'sous-lit',   'Box',      3),
        (v_chambre_id, u.id, 'Skincare',      'skincare',   'Sparkles', 4)
      ON CONFLICT (category_id, slug) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
