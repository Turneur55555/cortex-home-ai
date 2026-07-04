
-- 1. Extend catalog
ALTER TABLE public.badges_catalog
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secret_hint text,
  ADD COLUMN IF NOT EXISTS is_coming_soon boolean NOT NULL DEFAULT false;

-- 2. Backfill categories for existing badges
UPDATE public.badges_catalog SET category = 'first_steps' WHERE badge_key = 'first_workout';
UPDATE public.badges_catalog SET category = 'training' WHERE badge_key IN ('workouts_10','workouts_50','workouts_100','workouts_250');
UPDATE public.badges_catalog SET category = 'consistency' WHERE badge_key IN ('week_3','week_5','streak_7','streak_30','streak_100');
UPDATE public.badges_catalog SET category = 'nutrition' WHERE badge_key IN ('protein_7','protein_30');
UPDATE public.badges_catalog SET category = 'challenges' WHERE badge_key IN ('goals_1','goals_5','goals_15');
UPDATE public.badges_catalog SET category = 'transformation' WHERE badge_key IN ('body_1','body_10','body_30');

-- Default fallback
UPDATE public.badges_catalog SET category = 'training' WHERE category IS NULL;

-- 3. New badges — nutrition
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category)
VALUES
  ('protein_100', 'Maître des protéines', 'Atteignez votre objectif protéines 100 jours', 'Apple', 'legendary', 500, 'protein_days', 100, 125, 'nutrition'),
  ('nutrition_first', 'Premier repas', 'Enregistrez votre premier repas', 'Apple', 'common', 20, 'protein_days', 1, 105, 'nutrition')
ON CONFLICT (badge_key) DO NOTHING;

-- New badges — training extension (mythic tier)
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category)
VALUES
  ('workouts_500', 'Titan', 'Complétez 500 séances', 'Flame', 'mythic', 1000, 'workouts_count', 500, 55, 'training'),
  ('workouts_1000', 'Immortel', '1000 séances complétées', 'Crown', 'mythic', 2500, 'workouts_count', 1000, 56, 'training')
ON CONFLICT (badge_key) DO NOTHING;

-- Consistency extension
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category)
VALUES
  ('streak_365', 'Année de feu', '365 jours de streak', 'Flame', 'mythic', 2000, 'streak_days', 365, 105, 'consistency'),
  ('week_7', 'Sans repos', '7 séances en une semaine', 'Zap', 'epic', 200, 'weekly_workouts', 7, 75, 'consistency')
ON CONFLICT (badge_key) DO NOTHING;

-- Transformation
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category)
VALUES
  ('body_100', 'Chroniqueur du corps', '100 mesures enregistrées', 'Activity', 'legendary', 500, 'body_measurements', 100, 185, 'transformation')
ON CONFLICT (badge_key) DO NOTHING;

-- Challenges
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category)
VALUES
  ('goals_50', 'Conquérant', '50 objectifs atteints', 'Target', 'legendary', 500, 'goals_completed', 50, 155, 'challenges')
ON CONFLICT (badge_key) DO NOTHING;

-- Community (coming soon)
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category, is_coming_soon)
VALUES
  ('community_first_friend', 'Premier ami', 'Ajoutez votre premier ami', 'Award', 'common', 30, 'goals_completed', 999999, 300, 'community', true),
  ('community_challenge', 'Défi partagé', 'Complétez un défi communautaire', 'Trophy', 'rare', 150, 'goals_completed', 999999, 310, 'community', true)
ON CONFLICT (badge_key) DO NOTHING;

-- Secret badges (visible mais masqués tant que non débloqués)
INSERT INTO public.badges_catalog (badge_key, label, description, icon, rarity, xp_reward, requirement_type, requirement_value, sort_order, category, is_secret, secret_hint)
VALUES
  ('secret_night_owl', 'Oiseau de nuit', 'Complétez une séance après minuit', 'Star', 'epic', 200, 'workouts_count', 999999, 400, 'secret', true, 'Un exploit qui se réalise dans l''obscurité...'),
  ('secret_early_bird', 'Lève-tôt', 'Complétez une séance avant 6h du matin', 'Star', 'epic', 200, 'workouts_count', 999999, 410, 'secret', true, 'Le monde dort encore...')
ON CONFLICT (badge_key) DO NOTHING;

-- 4. New level formula: floor(sqrt(xp/100)), min 1
CREATE OR REPLACE FUNCTION public.compute_level_from_xp(_xp integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 100.0))::int);
$function$;

-- 5. Recompute all existing user levels
UPDATE public.user_stats
SET level = public.compute_level_from_xp(xp),
    updated_at = now();
