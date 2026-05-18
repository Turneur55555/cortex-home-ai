-- ═══════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP COMPLET — nouvelle instance bcwfvpwzxlmkxobvbtzp
-- Applique l'intégralité du schéma en une seule passe idempotente.
-- Exécuter dans : Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 : TABLES CORE
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── users_profiles ──────────────────────────────────────────────────────────
-- CRITIQUE : doit exister AVANT le trigger on_auth_user_created.
-- Sans cette table, chaque signUp() échoue avec rollback transactionnel.

CREATE TABLE IF NOT EXISTS public.users_profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  display_name text        CHECK (
    display_name IS NULL
    OR (char_length(display_name) >= 3 AND char_length(display_name) <= 20)
  )
);

ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users select own profile" ON public.users_profiles;
  DROP POLICY IF EXISTS "Users insert own profile" ON public.users_profiles;
  DROP POLICY IF EXISTS "Users update own profile" ON public.users_profiles;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Users select own profile" ON public.users_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.users_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.users_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_users_profiles_display_name
  ON public.users_profiles (display_name)
  WHERE display_name IS NOT NULL;

-- ─── Trigger : création automatique du profil à l'inscription ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── items ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.items (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text        NOT NULL CHECK (char_length(name) <= 200),
  category             text        DEFAULT 'autre',
  module               text        NOT NULL DEFAULT 'maison'
                                   CHECK (char_length(module) >= 1 AND char_length(module) <= 50),
  room                 text,
  location             text        CHECK (char_length(location) <= 100),
  quantity             int         NOT NULL DEFAULT 1 CHECK (quantity >= 0 AND quantity <= 9999),
  unit                 text        CHECK (char_length(unit) <= 50),
  expiration_date      timestamptz,
  confidence_score     float       CHECK (confidence_score >= 0 AND confidence_score <= 1),
  flagged              boolean     NOT NULL DEFAULT false,
  storage_path         text,
  notes                text        CHECK (char_length(notes) <= 1000),
  alert_days_before    integer     NOT NULL DEFAULT 7,
  low_stock_threshold  float,
  calories_per_100g    float,
  protein_per_100g     float,
  carbs_per_100g       float,
  fat_per_100g         float,
  fiber_per_100g       float,
  sugar_per_100g       float,
  sodium_per_100g      float,
  barcode              text,
  brand                text,
  image_url            text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own items" ON public.items;
CREATE POLICY "Users manage own items" ON public.items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_items_user_module ON public.items(user_id, module);
CREATE INDEX IF NOT EXISTS idx_items_expiration   ON public.items(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_flagged      ON public.items(user_id, flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_items_room         ON public.items(user_id, room) WHERE room IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER TABLE public.items REPLICA IDENTITY FULL;

-- ─── body_tracking ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.body_tracking (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date  NOT NULL CHECK (date <= current_date),
  weight      float CHECK (weight >= 20 AND weight <= 500),
  body_fat    float CHECK (body_fat >= 1 AND body_fat <= 70),
  muscle_mass float CHECK (muscle_mass >= 1 AND muscle_mass <= 100),
  chest       float CHECK (chest >= 30 AND chest <= 250),
  waist       float CHECK (waist >= 30 AND waist <= 250),
  hips        float CHECK (hips >= 30 AND hips <= 250),
  left_arm    float CHECK (left_arm >= 10 AND left_arm <= 100),
  right_arm   float CHECK (right_arm >= 10 AND right_arm <= 100),
  left_thigh  float CHECK (left_thigh >= 20 AND left_thigh <= 150),
  right_thigh float CHECK (right_thigh >= 20 AND right_thigh <= 150),
  notes       text  CHECK (char_length(notes) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.body_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own body" ON public.body_tracking;
CREATE POLICY "Users manage own body" ON public.body_tracking
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_body_tracking_user_date ON public.body_tracking(user_id, date DESC);

-- ─── workouts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workouts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             date NOT NULL,
  name             text NOT NULL CHECK (char_length(name) <= 200),
  duration_minutes int  CHECK (duration_minutes >= 1 AND duration_minutes <= 600),
  notes            text CHECK (char_length(notes) <= 1000),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own workouts" ON public.workouts;
CREATE POLICY "Users manage own workouts" ON public.workouts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON public.workouts(user_id, date DESC);

-- ─── exercises ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exercises (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id uuid  NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  name       text  NOT NULL CHECK (char_length(name) <= 200),
  sets       int   CHECK (sets >= 1 AND sets <= 100),
  reps       int   CHECK (reps >= 1 AND reps <= 10000),
  weight     float CHECK (weight >= 0 AND weight <= 1000),
  notes      text  CHECK (char_length(notes) <= 500),
  image_path text
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own exercises" ON public.exercises;
CREATE POLICY "Users manage own exercises" ON public.exercises
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercises_workout ON public.exercises(workout_id);

-- ─── exercise_history ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exercise_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name text        NOT NULL CHECK (char_length(exercise_name) BETWEEN 1 AND 200),
  last_sets     int         CHECK (last_sets >= 1 AND last_sets <= 100),
  last_reps     int         CHECK (last_reps >= 1 AND last_reps <= 10000),
  last_weight   float       CHECK (last_weight >= 0 AND last_weight <= 1000),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  usage_count   int         NOT NULL DEFAULT 1,
  UNIQUE (user_id, exercise_name)
);

ALTER TABLE public.exercise_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own exercise history" ON public.exercise_history;
CREATE POLICY "Users manage own exercise history" ON public.exercise_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_history_user_recent
  ON public.exercise_history (user_id, last_used_at DESC);

-- ─── nutrition ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nutrition (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                date  NOT NULL,
  meal                text  CHECK (meal IN ('petit-dejeuner','dejeuner','diner','collation')),
  name                text  NOT NULL CHECK (char_length(name) <= 200),
  calories            int   CHECK (calories >= 0 AND calories <= 10000),
  proteins            float CHECK (proteins >= 0 AND proteins <= 1000),
  carbs               float CHECK (carbs >= 0 AND carbs <= 1000),
  fats                float CHECK (fats >= 0 AND fats <= 1000),
  base_calories       float,
  base_proteins       float,
  base_carbs          float,
  base_fats           float,
  serving_count       float DEFAULT 1,
  percentage_consumed float DEFAULT 100,
  consumed_quantity   float,
  consumed_unit       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own nutrition" ON public.nutrition;
CREATE POLICY "Users manage own nutrition" ON public.nutrition
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_user_date ON public.nutrition(user_id, date DESC);

-- ─── nutrition_goals ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nutrition_goals (
  user_id    uuid   PRIMARY KEY,
  calories   integer,
  proteins   float,
  carbs      float,
  fats       float,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own nutrition goals" ON public.nutrition_goals;
CREATE POLICY "Users manage own nutrition goals" ON public.nutrition_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_nutrition_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_nutrition_goals_updated_at ON public.nutrition_goals;
CREATE TRIGGER trg_nutrition_goals_updated_at
  BEFORE UPDATE ON public.nutrition_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_nutrition_goals_updated_at();

-- ─── food_preferences ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.food_preferences (
  user_id           uuid     PRIMARY KEY,
  allergies         text[]   NOT NULL DEFAULT '{}',
  foods_to_avoid    text[]   NOT NULL DEFAULT '{}',
  goal              text,
  no_meat_dairy_mix boolean  NOT NULL DEFAULT false,
  other_rules       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own food prefs" ON public.food_preferences;
CREATE POLICY "Users manage own food prefs" ON public.food_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_food_preferences_updated_at ON public.food_preferences;
CREATE TRIGGER trg_food_preferences_updated_at
  BEFORE UPDATE ON public.food_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_nutrition_goals_updated_at();

-- ─── documents ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) <= 200),
  storage_path text NOT NULL,
  module       text NOT NULL CHECK (module IN ('alimentation','pharmacie','habits','menager','nutrition','fitness','body','documents')),
  summary      text,
  analysis     text,
  key_insights jsonb,
  alerts       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own documents" ON public.documents;
CREATE POLICY "Users manage own documents" ON public.documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);

-- ─── rate_limits ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       text NOT NULL CHECK (action IN (
    'analyze_pdf','scan_fridge','scan_meal','coach_workout',
    'recipe_assistant','muscle_readiness','chat','scan_image'
  )),
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own rate limits"   ON public.rate_limits;
DROP POLICY IF EXISTS "Users insert own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Block update on rate_limits"  ON public.rate_limits;
DROP POLICY IF EXISTS "Block delete on rate_limits"  ON public.rate_limits;

CREATE POLICY "Users see own rate limits"    ON public.rate_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own rate limits" ON public.rate_limits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Block update on rate_limits"  ON public.rate_limits AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY "Block delete on rate_limits"  ON public.rate_limits AS RESTRICTIVE FOR DELETE TO public USING (false);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limits(user_id, action, window_start);

-- ─── error_logs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.error_logs (
  id         uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  support_id text   NOT NULL UNIQUE,
  user_id    uuid,
  level      text   NOT NULL DEFAULT 'error',
  message    text   NOT NULL,
  stack      text,
  source     text,
  line       integer,
  col        integer,
  url        text,
  route      text,
  user_agent text,
  context    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users insert own errors" ON public.error_logs;
DROP POLICY IF EXISTS "Users view own errors"   ON public.error_logs;

CREATE POLICY "Users insert own errors" ON public.error_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own errors" ON public.error_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_user    ON public.error_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_support ON public.error_logs(support_id);

-- ─── health_data_imports ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.health_data_imports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path  text        NOT NULL,
  image_url   text,
  ocr_text    text,
  parsed_data jsonb,
  data_type   text,
  status      text        NOT NULL DEFAULT 'completed',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_data_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their health imports" ON public.health_data_imports;
CREATE POLICY "Users own their health imports" ON public.health_data_imports
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── stock_history ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id         uuid        REFERENCES public.items(id) ON DELETE SET NULL,
  item_name       text        NOT NULL CHECK (char_length(item_name) BETWEEN 1 AND 200),
  action_type     text        NOT NULL CHECK (action_type IN ('added','removed','adjusted','consumed','moved')),
  quantity_before float,
  quantity_after  float,
  source          text        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual','nutrition','scan','bulk')),
  meal_name       text,
  room_id         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own stock history" ON public.stock_history;
CREATE POLICY "Users manage own stock history" ON public.stock_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_stock_history_user ON public.stock_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_history_item ON public.stock_history(item_id) WHERE item_id IS NOT NULL;

-- ─── shopping_list ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_list (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name     text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  quantity float,
  unit     text,
  item_id  uuid        REFERENCES public.items(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  done     boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own shopping list" ON public.shopping_list;
CREATE POLICY "Users manage own shopping list" ON public.shopping_list
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_shopping_list_user ON public.shopping_list(user_id, added_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 : HOME CATEGORIES (avec seed automatique)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Supprimer les anciennes policies (évite les conflits) ───────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='home_categories' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.home_categories', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='home_subcategories' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.home_subcategories', pol.policyname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.home_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  name       text        NOT NULL,
  slug       text        NOT NULL,
  icon       text        NOT NULL DEFAULT 'Box',
  color      text        NOT NULL DEFAULT '#6366f1',
  position   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
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

CREATE INDEX IF NOT EXISTS idx_home_categories_user_pos ON public.home_categories(user_id, position);
CREATE INDEX IF NOT EXISTS idx_home_subcategories_cat   ON public.home_subcategories(category_id, position);

ALTER TABLE public.home_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hc_all" ON public.home_categories
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "hs_all" ON public.home_subcategories
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Fonction seed interne ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._seed_home_categories_for_user(uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cuisine_id uuid; v_sdb_id uuid; v_chambre_id uuid;
BEGIN
  INSERT INTO public.home_categories (user_id, name, slug, icon, color, position) VALUES
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

  SELECT id INTO v_cuisine_id FROM public.home_categories WHERE user_id=uid AND slug='cuisine';
  IF v_cuisine_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position) VALUES
      (v_cuisine_id, uid, 'Frigo',       'frigo',       'Refrigerator', 0),
      (v_cuisine_id, uid, 'Congélateur', 'congelateur', 'Snowflake',    1),
      (v_cuisine_id, uid, 'Placards',    'placard',     'Package',      2),
      (v_cuisine_id, uid, 'Épices',      'epices',      'Leaf',         3),
      (v_cuisine_id, uid, 'Tiroirs',     'tiroirs',     'Layers',       4),
      (v_cuisine_id, uid, 'Meuble haut', 'meuble-haut', 'Box',          5),
      (v_cuisine_id, uid, 'Meuble bas',  'meuble-bas',  'Box',          6)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  SELECT id INTO v_sdb_id FROM public.home_categories WHERE user_id=uid AND slug='salle-de-bain';
  IF v_sdb_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position) VALUES
      (v_sdb_id, uid, 'Armoire pharmacie', 'armoire-pharmacie', 'Shield',   0),
      (v_sdb_id, uid, 'Douche',            'douche',            'Droplets', 1),
      (v_sdb_id, uid, 'Lavabo',            'lavabo',            'Droplet',  2),
      (v_sdb_id, uid, 'Produits visage',   'produits-visage',   'Sparkles', 3),
      (v_sdb_id, uid, 'Produits corps',    'produits-corps',    'Heart',    4),
      (v_sdb_id, uid, 'Serviettes',        'serviettes',        'Wind',     5)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  SELECT id INTO v_chambre_id FROM public.home_categories WHERE user_id=uid AND slug='chambre';
  IF v_chambre_id IS NOT NULL THEN
    INSERT INTO public.home_subcategories (category_id, user_id, name, slug, icon, position) VALUES
      (v_chambre_id, uid, 'Table de nuit', 'table-nuit', 'Moon',     0),
      (v_chambre_id, uid, 'Armoire',       'armoire',    'Package',  1),
      (v_chambre_id, uid, 'Commode',       'commode',    'Layers',   2),
      (v_chambre_id, uid, 'Sous le lit',   'sous-lit',   'Box',      3),
      (v_chambre_id, uid, 'Skincare',      'skincare',   'Sparkles', 4)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;
END; $$;

-- ─── RPC frontend ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_home_categories_for_me()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'User must be logged in';
  END IF;
  PERFORM public._seed_home_categories_for_user(uid);
END; $$;

GRANT EXECUTE ON FUNCTION public.ensure_home_categories_for_me() TO authenticated;

-- ─── Trigger home_categories pour nouveaux users ─────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_default_home_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._seed_home_categories_for_user(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_home_categories ON auth.users;
CREATE TRIGGER on_auth_user_created_home_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_home_categories();

-- ─── Seed des utilisateurs existants ─────────────────────────────────────────
DO $$
DECLARE u record; seeded int := 0;
BEGIN
  FOR u IN
    SELECT au.id FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM public.home_categories hc WHERE hc.user_id = au.id)
  LOOP
    PERFORM public._seed_home_categories_for_user(u.id);
    seeded := seeded + 1;
  END LOOP;
  IF seeded > 0 THEN
    RAISE NOTICE '[bootstrap] home_categories créées pour % utilisateur(s)', seeded;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 : STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES
  ('food-images',      'food-images',      false),
  ('clothes-images',   'clothes-images',   false),
  ('pharmacy-images',  'pharmacy-images',  false),
  ('pdf-documents',    'pdf-documents',    false),
  ('exercise-images',  'exercise-images',  false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-images', 'health-images', false, 15728640,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
) ON CONFLICT (id) DO NOTHING;

-- Policies storage (idempotentes)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users read own files" ON storage.objects FOR SELECT
  USING (bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents','exercise-images')
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents','exercise-images')
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own files" ON storage.objects FOR UPDATE
  USING (bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents','exercise-images')
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE
  USING (bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents','exercise-images')
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own health images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own health images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'health-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 : REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated user-scoped realtime" ON realtime.messages;
CREATE POLICY "Authenticated user-scoped realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'postgres_changes'
    OR topic LIKE (auth.uid()::text || ':%')
    OR topic = auth.uid()::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN DU BOOTSTRAP
-- ═══════════════════════════════════════════════════════════════════════════
-- Après exécution : signup fonctionne, toutes les tables existent,
-- les catégories Maison sont créées automatiquement pour chaque nouvel user.
