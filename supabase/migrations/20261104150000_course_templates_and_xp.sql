-- =====================================================================
-- Cours encadrés (Lagree) — un modèle de séance, 50 XP par cours.
-- Décision Nathan (04/11/2026) : « option B, mais avec 50 XP ».
--
-- 1) `workout_templates.course_key` : un modèle peut être un COURS (pas un
--    nouveau module : il vit dans « Utiliser une séance sauvegardée », à
--    côté des modèles de musculation). NULL = modèle de musculation (tous
--    les modèles existants). Liste fermée, étendue par migration (HYROX
--    Episod viendra ici) — même liste que `COURSES` (src/lib/fitness/courses.ts).
-- 2) `reward_catalog.workout_course` : 50 XP par cours, plafond 100 XP par
--    semaine (deux cours payés plein). Séparé de `workout_support` (25 XP,
--    plafond 75 — HYROX, cardio, course, activités), qui ne change pas.
-- 3) `award_xp_on_workout_complete` : une séance terminée dont
--    `metadata.course` est un cours connu verse `workout_course` et rien
--    d'autre (ni séance muscu, ni série, ni progression d'exercice). Le
--    reste de la fonction est repris À L'IDENTIQUE de la production
--    (pg_get_functiondef relevé le 04/11/2026).
--
-- Additive et idempotente.
-- =====================================================================

-- ── 1. Modèle de cours ───────────────────────────────────────────────
ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS course_key text;

ALTER TABLE public.workout_templates
  DROP CONSTRAINT IF EXISTS workout_templates_course_key_check;
ALTER TABLE public.workout_templates
  ADD CONSTRAINT workout_templates_course_key_check
  CHECK (course_key IS NULL OR course_key IN ('lagree'));

COMMENT ON COLUMN public.workout_templates.course_key IS
  'Cours encadré (lagree) démarré par ce modèle ; NULL = modèle de musculation.';

-- ── 2. Catalogue : 50 XP par cours ───────────────────────────────────
INSERT INTO public.reward_catalog (source_key, xp_amount, weekly_cap, category, description)
VALUES (
  'workout_course', 50, 100, 'session',
  'Cours encadré terminé (Lagree) — 50 XP, plafonné à 100 XP par semaine'
)
ON CONFLICT (source_key) DO UPDATE
  SET xp_amount = EXCLUDED.xp_amount,
      weekly_cap = EXCLUDED.weekly_cap,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      active = true,
      updated_at = now();

-- ── 3. Trigger d'XP : branche « cours » ──────────────────────────────
CREATE OR REPLACE FUNCTION public.award_xp_on_workout_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_muscu       boolean;
  is_course      boolean;
  support_week   integer;
  course_week    integer;
  award          integer;
  had_prev_day   boolean;
  _xp_before     integer;
  _level_before  integer;
  _xp_after      integer;
  _level_after   integer;
  cat_muscu      public.reward_catalog%rowtype;
  cat_support    public.reward_catalog%rowtype;
  cat_streak     public.reward_catalog%rowtype;
  cat_course     public.reward_catalog%rowtype;
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
  SELECT * INTO cat_course FROM public.reward_catalog WHERE source_key = 'workout_course' AND active;

  SELECT xp, level INTO _xp_before, _level_before
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_before := COALESCE(_xp_before, 0);
  _level_before := COALESCE(_level_before, public.compute_level_from_xp(_xp_before));

  is_course := (COALESCE(NEW.metadata ->> 'course', '') IN ('lagree'));
  is_muscu := (NOT is_course) AND (COALESCE(NEW.discipline, 'muscu') = 'muscu');

  IF is_course THEN
    IF cat_course.source_key IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO course_week
      FROM public.xp_events
      WHERE user_id = NEW.user_id
        AND source = 'workout_course'
        AND created_at >= date_trunc('week', now());

      award := LEAST(cat_course.xp_amount, GREATEST(0, COALESCE(cat_course.weekly_cap, cat_course.xp_amount) - course_week));
      IF award > 0 THEN
        PERFORM public.award_character_xp(NEW.user_id, 'workout_course', award, NEW.id);
      END IF;
    END IF;

  ELSIF is_muscu THEN
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
$function$;
