-- =====================================================================
-- RPG P1.7 — Économie d'XP réduite à la seule progression réelle
-- d'entraînement (décisions validées par Nathan après audit complet).
--
-- 1) `pr_muscu` retiré : doublon direct de `exercise_weight_record`
--    (les deux détectaient "une charge bat l'historique", à deux
--    granularités différentes). Une progression réelle = une récompense.
-- 2) Les 4 records par exercice (poids/reps/volume/1RM) restent détectés
--    séparément (utile pour statistiques/historique futurs) mais ne
--    versent plus qu'UNE SEULE récompense XP par exercice et par séance,
--    quel que soit le nombre de métriques battues simultanément. Nouvelle
--    source unique `exercise_progress_record`, même rendement décroissant
--    hebdomadaire ('exercise_progress') que les 4 anciennes sources
--    (retirées du catalogue, pas supprimées : l'historique `xp_events`
--    déjà versé reste lisible).
-- 3) Badges, Achievements et Goals ne versent plus d'XP : ce sont des
--    couches de prestige/collection/suivi personnel, pas des sources de
--    progression. Toute leur mécanique de validation/persistance est
--    conservée (elle reste utile pour la collection et l'intégrité des
--    trophées) — seul l'appel à `award_character_xp` est retiré.
--
-- L'économie XP se réduit désormais à 5 familles : workout_muscu,
-- workout_support, streak, exercise_progress_record,
-- exercise_rank_up_<titre> (×6). Aucun doublon, aucun déclenchement
-- manuel requis (la montée de Rang par exercice devient automatique à la
-- clôture de séance — voir `useVerifyExerciseRanksForSession` côté client).
-- =====================================================================

-- ── 1. Catalogue : retirer pr_muscu + les 4 anciennes sources de record,
--       ajouter la source unique consolidée ────────────────────────────
UPDATE public.reward_catalog SET active = false
WHERE source_key IN (
  'pr_muscu',
  'exercise_weight_record',
  'exercise_reps_record',
  'exercise_volume_record',
  'exercise_1rm_record'
);

INSERT INTO public.reward_catalog (source_key, xp_amount, weekly_cap, category, diminishing_group, diminishing_curve, description)
VALUES (
  'exercise_progress_record', 30, NULL, 'exercise', 'exercise_progress', ARRAY[100,80,60,40],
  'Progression réelle sur un exercice (poids, reps, volume ou 1RM battus) — une seule récompense par exercice et par séance, quel que soit le nombre de métriques améliorées'
)
ON CONFLICT (source_key) DO NOTHING;

-- ── 2. Trigger de clôture de séance : retire pr_muscu, consolide les
--       4 records en une seule récompense par exercice ─────────────────
CREATE OR REPLACE FUNCTION public.award_xp_on_workout_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_muscu       boolean;
  support_week   integer;
  award          integer;
  had_prev_day   boolean;
  _xp_before     integer;
  _level_before  integer;
  _xp_after      integer;
  _level_after   integer;
  cat_muscu      public.reward_catalog%rowtype;
  cat_support    public.reward_catalog%rowtype;
  cat_streak     public.reward_catalog%rowtype;
  ex_rec         record;
  cur_weight     numeric;
  cur_reps       integer;
  cur_volume     numeric;
  cur_1rm        numeric;
  hist_weight    numeric;
  hist_reps      integer;
  hist_1rm       numeric;
  hist_volume    numeric;
  exercise_key   text;
  progress_count integer;
  has_progress   boolean;
BEGIN
  IF NOT (
    NEW.status = 'completed'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cat_muscu FROM public.reward_catalog WHERE source_key = 'workout_muscu' AND active;
  SELECT * INTO cat_support FROM public.reward_catalog WHERE source_key = 'workout_support' AND active;
  SELECT * INTO cat_streak FROM public.reward_catalog WHERE source_key = 'streak' AND active;

  SELECT xp, level INTO _xp_before, _level_before
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_before := COALESCE(_xp_before, 0);
  _level_before := COALESCE(_level_before, public.compute_level_from_xp(_xp_before));

  is_muscu := (COALESCE(NEW.discipline, 'muscu') = 'muscu');

  IF is_muscu THEN
    IF cat_muscu.source_key IS NOT NULL THEN
      PERFORM public.award_character_xp(NEW.user_id, 'workout_muscu', cat_muscu.xp_amount, NEW.id);
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.workouts w3
      WHERE w3.user_id = NEW.user_id
        AND w3.status = 'completed'
        AND w3.id <> NEW.id
        AND w3.date::date = (NEW.date::date - 1)
    ) INTO had_prev_day;

    IF had_prev_day AND cat_streak.source_key IS NOT NULL THEN
      PERFORM public.award_character_xp(NEW.user_id, 'streak', cat_streak.xp_amount, NEW.id);
    END IF;

    -- Progression par exercice : UNE seule récompense par exercice, même si
    -- plusieurs métriques (poids/reps/volume/1RM) sont battues en même
    -- temps — c'est la même progression réelle, pas quatre.
    SELECT COUNT(*) INTO progress_count
    FROM public.xp_events xe
    JOIN public.reward_catalog rc ON rc.source_key = xe.source
    WHERE xe.user_id = NEW.user_id
      AND rc.diminishing_group = 'exercise_progress'
      AND xe.created_at >= date_trunc('week', now());

    FOR ex_rec IN
      SELECT e.id AS exercise_id, e.exercise_reference_id, e.name
      FROM public.exercises e
      WHERE e.workout_id = NEW.id
    LOOP
      SELECT
        MAX(s.weight),
        MAX(s.reps),
        COALESCE(SUM(s.weight * s.reps), 0),
        MAX(CASE WHEN s.weight IS NOT NULL AND s.reps IS NOT NULL AND s.reps > 0
                 THEN s.weight * (1 + s.reps / 30.0) END)
      INTO cur_weight, cur_reps, cur_volume, cur_1rm
      FROM public.exercise_sets s
      WHERE s.exercise_id = ex_rec.exercise_id;

      SELECT
        MAX(s2.weight),
        MAX(s2.reps),
        MAX(CASE WHEN s2.weight IS NOT NULL AND s2.reps IS NOT NULL AND s2.reps > 0
                 THEN s2.weight * (1 + s2.reps / 30.0) END)
      INTO hist_weight, hist_reps, hist_1rm
      FROM public.exercises e2
      JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
      JOIN public.workouts w2 ON w2.id = e2.workout_id
      WHERE w2.user_id = NEW.user_id
        AND w2.status = 'completed'
        AND w2.id <> NEW.id
        AND w2.created_at < NEW.created_at
        AND (
          (ex_rec.exercise_reference_id IS NOT NULL AND e2.exercise_reference_id = ex_rec.exercise_reference_id)
          OR (ex_rec.exercise_reference_id IS NULL AND lower(btrim(e2.name)) = lower(btrim(ex_rec.name)))
        );

      SELECT MAX(session_vol) INTO hist_volume FROM (
        SELECT w2.id, SUM(s2.weight * s2.reps) AS session_vol
        FROM public.exercises e2
        JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
        JOIN public.workouts w2 ON w2.id = e2.workout_id
        WHERE w2.user_id = NEW.user_id
          AND w2.status = 'completed'
          AND w2.id <> NEW.id
          AND w2.created_at < NEW.created_at
          AND (
            (ex_rec.exercise_reference_id IS NOT NULL AND e2.exercise_reference_id = ex_rec.exercise_reference_id)
            OR (ex_rec.exercise_reference_id IS NULL AND lower(btrim(e2.name)) = lower(btrim(ex_rec.name)))
          )
        GROUP BY w2.id
      ) sub;

      has_progress :=
        (cur_weight IS NOT NULL AND cur_weight > COALESCE(hist_weight, 0))
        OR (cur_reps IS NOT NULL AND cur_reps > COALESCE(hist_reps, 0))
        OR (cur_volume > COALESCE(hist_volume, 0) AND cur_volume > 0)
        OR (cur_1rm IS NOT NULL AND cur_1rm > COALESCE(hist_1rm, 0));

      IF has_progress THEN
        exercise_key := COALESCE(ex_rec.exercise_reference_id::text, lower(btrim(ex_rec.name)));
        PERFORM public.award_diminishing_reward(
          NEW.user_id, 'exercise_progress_record',
          'exercise_progress_record:' || NEW.id::text || ':' || exercise_key,
          progress_count
        );
        progress_count := progress_count + 1;
      END IF;
    END LOOP;

  ELSIF cat_support.source_key IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO support_week
    FROM public.xp_events
    WHERE user_id = NEW.user_id
      AND source = 'workout_support'
      AND created_at >= date_trunc('week', now());

    award := LEAST(cat_support.xp_amount, GREATEST(0, COALESCE(cat_support.weekly_cap, cat_support.xp_amount) - support_week));
    IF award > 0 THEN
      PERFORM public.award_character_xp(NEW.user_id, 'workout_support', award, NEW.id);
    END IF;
  END IF;

  SELECT xp, level INTO _xp_after, _level_after
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_after := COALESCE(_xp_after, _xp_before);
  _level_after := COALESCE(_level_after, public.compute_level_from_xp(_xp_after));

  UPDATE public.workouts
    SET xp_before = _xp_before, xp_after = _xp_after,
        level_before = _level_before, level_after = _level_after
    WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_xp_on_workout_complete()
  FROM PUBLIC, anon, authenticated;

-- ── 3. Badges : ne versent plus d'XP (prestige/collection uniquement) ──
CREATE OR REPLACE FUNCTION public.unlock_user_badge(_badge_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _badge   badges_catalog%rowtype;
  _stats   jsonb;
  _current numeric;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _badge FROM badges_catalog WHERE badge_key = _badge_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Badge not found: %', _badge_key;
  END IF;

  IF EXISTS(SELECT 1 FROM user_badges WHERE user_id = _user_id AND badge_key = _badge_key) THEN
    RETURN;
  END IF;

  _stats := compute_fitness_stats(_user_id);
  _current := coalesce((_stats->>_badge.requirement_type)::numeric, 0);
  IF _current < _badge.requirement_value THEN
    RAISE EXCEPTION 'Criteria not met for %: % < %', _badge_key, _current, _badge.requirement_value;
  END IF;

  -- Prestige/collection uniquement : plus aucun versement d'XP (P1.7).
  INSERT INTO user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  VALUES (_user_id, _badge.badge_key, _badge.label, _badge.icon, _badge.rarity, _badge.xp_reward, _badge.description)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_user_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

-- ── 4. Objectifs : ne versent plus d'XP (suivi personnel uniquement) ───
CREATE OR REPLACE FUNCTION public.award_goal_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_completed = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_completed, false) = false)
     AND NOT COALESCE(NEW.xp_awarded, false) THEN
    -- Prestige/suivi personnel uniquement : plus aucun versement d'XP (P1.7).
    -- `xp_awarded` reste positionné pour la cohérence de l'état affiché.
    NEW.xp_awarded := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_goal_xp() FROM PUBLIC, anon, authenticated;

-- ── 5. Achievements : ne versent plus d'XP (prestige/collection) ──────
CREATE OR REPLACE FUNCTION public.claim_achievement(_achievement_id text, _xp_reward integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id   uuid := auth.uid();
  _amount    integer;
  _match     text[];
  _prefix    text;
  _threshold numeric;
  _criteria  public.achievement_criteria%rowtype;
  _stats     jsonb;
  _current   numeric;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _achievement_id IS NULL OR btrim(_achievement_id) = '' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = _user_id AND achievement_id = _achievement_id
  ) THEN
    RETURN;
  END IF;

  _match := regexp_match(_achievement_id, '^(.+)_(\d+)_(\d+(?:\.\d+)?)$');
  IF _match IS NULL THEN
    RETURN;
  END IF;

  _prefix := _match[1];
  _threshold := _match[3]::numeric;

  SELECT * INTO _criteria FROM public.achievement_criteria WHERE id_prefix = _prefix;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  _stats := public.compute_achievement_stats(_user_id);
  _current := COALESCE((_stats->>_criteria.requirement_type)::numeric, 0);

  IF _current < _threshold THEN
    RETURN;
  END IF;

  -- Prestige/collection uniquement : plus aucun versement d'XP (P1.7).
  -- `xp_reward` conservé sur la ligne pour affichage historique éventuel.
  _amount := LEAST(GREATEST(COALESCE(_xp_reward, 0), 0), 1000);

  INSERT INTO public.user_achievements (user_id, achievement_id, xp_reward)
  VALUES (_user_id, _achievement_id, _amount)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievement(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement(text, integer) TO authenticated;
