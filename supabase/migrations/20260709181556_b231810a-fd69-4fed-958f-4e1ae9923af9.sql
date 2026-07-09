
-- ============================================================
-- workouts : discipline / status / metadata
-- ============================================================
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'muscu',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workouts_user_discipline
  ON public.workouts(user_id, discipline);

-- ============================================================
-- exercise_sets : rest_seconds
-- ============================================================
ALTER TABLE public.exercise_sets
  ADD COLUMN IF NOT EXISTS rest_seconds integer;

-- ============================================================
-- exercises : muscle_groups (résolution IA)
-- ============================================================
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS muscle_groups text[];

-- ============================================================
-- goals : start_value (baseline perte de poids)
-- ============================================================
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS start_value double precision;

-- ============================================================
-- exercise_catalog : bibliothèque partagée d'exercices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exercise_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  group_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_catalog TO authenticated;
GRANT ALL ON public.exercise_catalog TO service_role;

ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read catalog" ON public.exercise_catalog;
CREATE POLICY "Authenticated can read catalog"
  ON public.exercise_catalog FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert catalog" ON public.exercise_catalog;
CREATE POLICY "Authenticated can insert catalog"
  ON public.exercise_catalog FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update catalog" ON public.exercise_catalog;
CREATE POLICY "Authenticated can update catalog"
  ON public.exercise_catalog FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete catalog" ON public.exercise_catalog;
CREATE POLICY "Authenticated can delete catalog"
  ON public.exercise_catalog FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- user_exercise_illustrations : photos personnelles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_exercise_illustrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_exercise_illustrations TO authenticated;
GRANT ALL ON public.user_exercise_illustrations TO service_role;

ALTER TABLE public.user_exercise_illustrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own illustrations" ON public.user_exercise_illustrations;
CREATE POLICY "Users manage own illustrations"
  ON public.user_exercise_illustrations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_illustrations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_illustrations ON public.user_exercise_illustrations;
CREATE TRIGGER trg_touch_illustrations
  BEFORE UPDATE ON public.user_exercise_illustrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_illustrations_updated_at();

-- ============================================================
-- get_user_streak_days : jours consécutifs d'activité
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_streak_days()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  streak_len integer;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;

  WITH activity_dates AS (
    SELECT (created_at AT TIME ZONE 'Europe/Paris')::date AS d
      FROM public.workouts WHERE user_id = uid
    UNION
    SELECT date::date AS d
      FROM public.nutrition WHERE user_id = uid
    UNION
    SELECT date::date AS d
      FROM public.body_tracking WHERE user_id = uid
  ),
  d AS (SELECT DISTINCT d FROM activity_dates WHERE d IS NOT NULL),
  grouped AS (
    SELECT d, (d - (row_number() OVER (ORDER BY d))::int) AS grp FROM d
  ),
  runs AS (
    SELECT max(d) AS last_date, count(*) AS run_len FROM grouped GROUP BY grp
  )
  SELECT run_len INTO streak_len
    FROM runs
   WHERE last_date >= ((now() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')
   ORDER BY last_date DESC
   LIMIT 1;

  RETURN COALESCE(streak_len, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.get_user_streak_days() TO authenticated;
