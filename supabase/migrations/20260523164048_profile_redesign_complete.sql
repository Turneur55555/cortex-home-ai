-- ============================================================
-- Profile Redesign — Complete Migration
-- Creates: user_stats, user_badges, goals, badges_catalog
-- ============================================================

-- USER STATS
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id      uuid    PRIMARY KEY,
  xp           integer NOT NULL DEFAULT 0,
  level        integer NOT NULL DEFAULT 1,
  total_actions integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own stats" ON public.user_stats;
CREATE POLICY "Users manage own stats" ON public.user_stats
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS user_stats_touch ON public.user_stats;
CREATE TRIGGER user_stats_touch BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- USER BADGES
CREATE TABLE IF NOT EXISTS public.user_badges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  badge_key   text        NOT NULL,
  label       text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'Award',
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  rarity      text        NOT NULL DEFAULT 'common',
  xp_reward   integer     NOT NULL DEFAULT 50,
  description text        NOT NULL DEFAULT '',
  UNIQUE (user_id, badge_key)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own badges" ON public.user_badges;
CREATE POLICY "Users manage own badges" ON public.user_badges
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges (user_id, unlocked_at DESC);

-- USER ACTIVITY
CREATE TABLE IF NOT EXISTS public.user_activity (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  type       text        NOT NULL,
  label      text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own activity" ON public.user_activity;
CREATE POLICY "Users manage own activity" ON public.user_activity
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON public.user_activity (user_id, created_at DESC);

-- GOALS TABLE (Supabase-backed, replaces localStorage)
CREATE TABLE IF NOT EXISTS public.goals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  goal_type    text        NOT NULL DEFAULT 'custom',
  target_value numeric,
  target_date  date        NOT NULL,
  xp_reward    integer     NOT NULL DEFAULT 100,
  is_completed boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "goals_user_policy" ON public.goals;
CREATE POLICY "goals_user_policy" ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS goals_touch ON public.goals;
CREATE TRIGGER goals_touch
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals (user_id, created_at DESC);

-- BADGES CATALOG (reference table — all users can read)
CREATE TABLE IF NOT EXISTS public.badges_catalog (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key         text    UNIQUE NOT NULL,
  label             text    NOT NULL,
  description       text    NOT NULL DEFAULT '',
  icon              text    NOT NULL DEFAULT 'Award',
  rarity            text    NOT NULL DEFAULT 'common',
  xp_reward         integer NOT NULL DEFAULT 50,
  requirement_type  text    NOT NULL,
  requirement_value numeric NOT NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.badges_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badges_catalog_read" ON public.badges_catalog;
CREATE POLICY "badges_catalog_read" ON public.badges_catalog
  FOR SELECT USING (true);

-- Seed badge catalog
INSERT INTO public.badges_catalog
  (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order)
VALUES
  ('first_rep',        'Première Rep',      'Validez votre première séance de sport',       'Zap',       'common',    50,   'workouts_count',    1,   10),
  ('discipline',       'Discipline',        '3 séances dans la même semaine',               'Target',    'common',    100,  'weekly_workouts',   3,   20),
  ('warrior',          'Warrior',           '10 séances au total',                          'Dumbbell',  'rare',      200,  'workouts_count',    10,  30),
  ('iron_will',        'Iron Will',         '50 séances au total',                          'Shield',    'epic',      1000, 'workouts_count',    50,  40),
  ('legend',           'Légende',           '100 séances au total',                         'Crown',     'legendary', 2000, 'workouts_count',    100, 50),
  ('streak_7',         'Semaine de Feu',    '7 jours d''activité consécutifs',              'Flame',     'common',    150,  'streak_days',       7,   60),
  ('streak_30',        'Marathonien',       '30 jours d''activité consécutifs',             'Trophy',    'epic',      500,  'streak_days',       30,  70),
  ('nutrition_master', 'Nutrition Master',  'Atteignez votre objectif protéines 7 jours',  'Apple',     'rare',      300,  'protein_days',      7,   80),
  ('goal_crusher',     'Goal Crusher',      'Terminez votre premier objectif',              'Star',      'common',    100,  'goals_completed',   1,   90),
  ('body_tracker',     'Body Tracker',      'Enregistrez 5 mesures corporelles',            'Activity',  'common',    75,   'body_measurements', 5,   100)
ON CONFLICT (badge_key) DO NOTHING;
