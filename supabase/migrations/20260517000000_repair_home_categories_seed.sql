-- ─── Réparation complète du système home_categories ─────────────────────────
-- Problème : la migration auto-Lovable (20260516201530) a créé les tables
-- sans seed function, sans trigger et sans données pour les utilisateurs
-- existants. Ce fichier répare tout de manière idempotente et sûre.
--
-- Idempotent : ON CONFLICT DO NOTHING, DROP IF EXISTS, CREATE OR REPLACE.
-- Sûr : ne touche pas aux catégories déjà existantes.

-- ─── 1. Nettoyer toutes les policies existantes (n'importe quel nom) ─────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_categories'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.home_categories', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_subcategories'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.home_subcategories', pol.policyname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignore si les tables n'existent pas encore
END;
$$;

-- ─── 2. Création des tables (si elles n'existent pas encore) ─────────────────

CREATE TABLE IF NOT EXISTS public.home_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'Box',
  color       text        NOT NULL DEFAULT '#6366f1',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.home_subcategories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.home_categories(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'Box',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_home_categories_user_pos
  ON public.home_categories (user_id, position);

CREATE INDEX IF NOT EXISTS idx_home_subcategories_cat
  ON public.home_subcategories (category_id, position);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.home_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hc_all" ON public.home_categories
  FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "hs_all" ON public.home_subcategories
  FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 4. Fonction seed interne (SECURITY DEFINER → bypass RLS) ────────────────

CREATE OR REPLACE FUNCTION public._seed_home_categories_for_user(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuisine_id  uuid;
  v_sdb_id      uuid;
  v_chambre_id  uuid;
BEGIN
  -- Catégories par défaut
  INSERT INTO public.home_categories (user_id, name, slug, icon, color, position)
  VALUES
    (uid, 'Cuisine',       'cuisine',       'ChefHat',        '#f97316', 0),
    (uid, 'Salle de bain', 'salle-de-bain', 'Bath',           '#06b6d4', 1),
    (uid, 'Chambre',       'chambre',       'Bed',            '#8b5cf6', 2),
    (uid, 'Salon',         'salon',         'Sofa',           '#10b981', 3),
    (uid, 'Dressing',      'dressing',      'Shirt',          '#f59e0b', 4),
    (uid, 'Bureau',        'bureau',        'Monitor',        '#6366f1', 5),
    (uid, 'Entrée',        'entree',        'DoorOpen',       '#eab308', 6),
    (uid, 'Buanderie',     'buanderie',     'WashingMachine', '#0ea5e9', 7),
    (uid, 'Cave',          'cave',          'Archive',        '#78716c', 8),
    (uid, 'Garage',        'garage',        'Car',            '#64748b', 9),
    (uid, 'Balcon',        'balcon',        'TreePine',       '#22c55e', 10)
  ON CONFLICT (user_id, slug) DO NOTHING;

  -- Sous-catégories Cuisine
  SELECT id INTO v_cuisine_id
  FROM public.home_categories WHERE user_id = uid AND slug = 'cuisine';

  IF v_cuisine_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_cuisine_id, uid, 'Frigo',       'frigo',       'Refrigerator', 0),
      (v_cuisine_id, uid, 'Congélateur', 'congelateur', 'Snowflake',    1),
      (v_cuisine_id, uid, 'Placards',    'placard',     'Package',      2),
      (v_cuisine_id, uid, 'Épices',      'epices',      'Leaf',         3),
      (v_cuisine_id, uid, 'Tiroirs',     'tiroirs',     'Layers',       4),
      (v_cuisine_id, uid, 'Meuble haut', 'meuble-haut', 'Box',          5),
      (v_cuisine_id, uid, 'Meuble bas',  'meuble-bas',  'Box',          6)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  -- Sous-catégories Salle de bain
  SELECT id INTO v_sdb_id
  FROM public.home_categories WHERE user_id = uid AND slug = 'salle-de-bain';

  IF v_sdb_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_sdb_id, uid, 'Armoire pharmacie', 'armoire-pharmacie', 'Shield',   0),
      (v_sdb_id, uid, 'Douche',            'douche',            'Droplets', 1),
      (v_sdb_id, uid, 'Lavabo',            'lavabo',            'Droplet',  2),
      (v_sdb_id, uid, 'Produits visage',   'produits-visage',   'Sparkles', 3),
      (v_sdb_id, uid, 'Produits corps',    'produits-corps',    'Heart',    4),
      (v_sdb_id, uid, 'Serviettes',        'serviettes',        'Wind',     5)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  -- Sous-catégories Chambre
  SELECT id INTO v_chambre_id
  FROM public.home_categories WHERE user_id = uid AND slug = 'chambre';

  IF v_chambre_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position)
    VALUES
      (v_chambre_id, uid, 'Table de nuit', 'table-nuit', 'Moon',     0),
      (v_chambre_id, uid, 'Armoire',       'armoire',    'Package',  1),
      (v_chambre_id, uid, 'Commode',       'commode',    'Layers',   2),
      (v_chambre_id, uid, 'Sous le lit',   'sous-lit',   'Box',      3),
      (v_chambre_id, uid, 'Skincare',      'skincare',   'Sparkles', 4)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;
END;
$$;

-- ─── 5. Wrapper RPC appelable depuis le frontend ──────────────────────────────
-- Seed uniquement pour l'utilisateur authentifié courant.
-- SECURITY DEFINER : bypass RLS pour l'insertion, mais limité à auth.uid().

CREATE OR REPLACE FUNCTION public.ensure_home_categories_for_me()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'User must be logged in';
  END IF;
  PERFORM public._seed_home_categories_for_user(uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_home_categories_for_me() TO authenticated;

-- ─── 6. Trigger function (nouveaux utilisateurs) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_default_home_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._seed_home_categories_for_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_home_categories ON auth.users;
CREATE TRIGGER on_auth_user_created_home_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_home_categories();

-- ─── 7. Seed de tous les utilisateurs existants sans catégories ───────────────
-- ON CONFLICT DO NOTHING → idempotent, ne touche pas aux données existantes.

DO $$
DECLARE
  u record;
  seeded integer := 0;
BEGIN
  FOR u IN
    SELECT au.id
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.home_categories hc WHERE hc.user_id = au.id
    )
  LOOP
    PERFORM public._seed_home_categories_for_user(u.id);
    seeded := seeded + 1;
  END LOOP;

  IF seeded > 0 THEN
    RAISE NOTICE '[repair] Catégories créées pour % utilisateur(s)', seeded;
  ELSE
    RAISE NOTICE '[repair] Tous les utilisateurs avaient déjà des catégories.';
  END IF;
END;
$$;
