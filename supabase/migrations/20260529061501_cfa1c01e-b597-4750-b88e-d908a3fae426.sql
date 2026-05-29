
-- 1. badges_catalog table
CREATE TABLE IF NOT EXISTS public.badges_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Award',
  rarity text NOT NULL DEFAULT 'common',
  xp_reward integer NOT NULL DEFAULT 50,
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.badges_catalog TO anon, authenticated;
GRANT ALL ON public.badges_catalog TO service_role;

ALTER TABLE public.badges_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Badges catalog readable by all" ON public.badges_catalog;
CREATE POLICY "Badges catalog readable by all"
ON public.badges_catalog FOR SELECT
USING (true);

-- 2. Add missing columns to user_badges
ALTER TABLE public.user_badges
  ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_user_id_badge_key_key;
ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_user_id_badge_key_key UNIQUE (user_id, badge_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

-- 3. Add INSERT/UPDATE/DELETE policies to user_badges
DROP POLICY IF EXISTS "Users insert own badges" ON public.user_badges;
CREATE POLICY "Users insert own badges"
ON public.user_badges FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own badges" ON public.user_badges;
CREATE POLICY "Users update own badges"
ON public.user_badges FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own badges" ON public.user_badges;
CREATE POLICY "Users delete own badges"
ON public.user_badges FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 4. user_stats: allow insert/update by owner
GRANT SELECT, INSERT, UPDATE ON public.user_stats TO authenticated;
GRANT ALL ON public.user_stats TO service_role;

DROP POLICY IF EXISTS "Users insert own stats" ON public.user_stats;
CREATE POLICY "Users insert own stats"
ON public.user_stats FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own stats" ON public.user_stats;
CREATE POLICY "Users update own stats"
ON public.user_stats FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- 5. Helper: level from xp
CREATE OR REPLACE FUNCTION public.compute_level_from_xp(_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 50.0))::int + 1);
$$;

-- 6. Trigger: award XP when a badge is unlocked
CREATE OR REPLACE FUNCTION public.award_xp_on_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_xp integer;
BEGIN
  INSERT INTO public.user_stats (user_id, xp, level, total_actions)
  VALUES (NEW.user_id, COALESCE(NEW.xp_reward,0), 1, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET xp = public.user_stats.xp + COALESCE(NEW.xp_reward,0),
        total_actions = public.user_stats.total_actions + 1,
        updated_at = now()
  RETURNING xp INTO new_xp;

  UPDATE public.user_stats
    SET level = public.compute_level_from_xp(new_xp)
    WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_xp_on_badge ON public.user_badges;
CREATE TRIGGER trg_award_xp_on_badge
AFTER INSERT ON public.user_badges
FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_badge();

-- Ensure user_stats has unique user_id for upsert
CREATE UNIQUE INDEX IF NOT EXISTS user_stats_user_id_key ON public.user_stats(user_id);

-- 7. Trigger: award XP when a goal is completed
CREATE OR REPLACE FUNCTION public.award_xp_on_goal_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_xp integer;
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.is_completed = true AND COALESCE(OLD.is_completed,false) = false)
     OR (TG_OP = 'INSERT' AND NEW.is_completed = true) THEN
    INSERT INTO public.user_stats (user_id, xp, level, total_actions)
    VALUES (NEW.user_id, COALESCE(NEW.xp_reward,0), 1, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET xp = public.user_stats.xp + COALESCE(NEW.xp_reward,0),
          total_actions = public.user_stats.total_actions + 1,
          updated_at = now()
    RETURNING xp INTO new_xp;

    UPDATE public.user_stats
      SET level = public.compute_level_from_xp(new_xp)
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_xp_on_goal_complete ON public.goals;
CREATE TRIGGER trg_award_xp_on_goal_complete
AFTER INSERT OR UPDATE OF is_completed ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_goal_complete();

-- 8. Seed badges_catalog
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order) VALUES
  ('first_workout', 'Premier pas', 'Termine ta première séance', 'Dumbbell', 'common', 50, 'workouts_count', 1, 10),
  ('workouts_10', 'Régulier', 'Termine 10 séances', 'Activity', 'common', 100, 'workouts_count', 10, 20),
  ('workouts_50', 'Athlète', 'Termine 50 séances', 'Trophy', 'rare', 250, 'workouts_count', 50, 30),
  ('workouts_100', 'Centurion', 'Termine 100 séances', 'Crown', 'epic', 500, 'workouts_count', 100, 40),
  ('workouts_250', 'Légende', 'Termine 250 séances', 'Star', 'legendary', 1000, 'workouts_count', 250, 50),
  ('week_3', 'Semaine intense', '3 séances en une semaine', 'Zap', 'common', 75, 'weekly_workouts', 3, 60),
  ('week_5', 'Machine', '5 séances en une semaine', 'Flame', 'rare', 150, 'weekly_workouts', 5, 70),
  ('streak_7', 'Une semaine de feu', '7 jours de streak', 'Flame', 'common', 100, 'streak_days', 7, 80),
  ('streak_30', 'Un mois en flammes', '30 jours de streak', 'Flame', 'epic', 400, 'streak_days', 30, 90),
  ('streak_100', 'Inarrêtable', '100 jours de streak', 'Crown', 'legendary', 1200, 'streak_days', 100, 100),
  ('protein_7', 'Hauts en protéines', 'Atteins tes protéines 7 jours', 'Apple', 'common', 80, 'protein_days', 7, 110),
  ('protein_30', 'Pro de la nutrition', 'Atteins tes protéines 30 jours', 'Apple', 'epic', 350, 'protein_days', 30, 120),
  ('goals_1', 'Premier objectif', 'Atteins ton premier objectif', 'Target', 'common', 75, 'goals_completed', 1, 130),
  ('goals_5', 'Multi-objectifs', 'Atteins 5 objectifs', 'Target', 'rare', 200, 'goals_completed', 5, 140),
  ('goals_15', 'Maître des objectifs', 'Atteins 15 objectifs', 'Shield', 'epic', 500, 'goals_completed', 15, 150),
  ('body_1', 'Suivi commencé', 'Première mesure corporelle', 'CheckCircle', 'common', 30, 'body_measurements', 1, 160),
  ('body_10', 'Mesures régulières', '10 mesures enregistrées', 'CheckCircle', 'rare', 150, 'body_measurements', 10, 170),
  ('body_30', 'Suivi assidu', '30 mesures enregistrées', 'Award', 'epic', 400, 'body_measurements', 30, 180)
ON CONFLICT (badge_key) DO NOTHING;
