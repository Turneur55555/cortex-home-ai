
-- ============================================================
-- user_preferences : height_cm
-- ============================================================
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS height_cm integer;

-- ============================================================
-- exercises : superset_group (utilisé par les modèles)
-- ============================================================
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS superset_group integer;

-- ============================================================
-- weekly_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  fitness_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  nutrition_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_url text,
  status text NOT NULL DEFAULT 'generating',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reports TO authenticated;
GRANT ALL ON public.weekly_reports TO service_role;

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own weekly reports" ON public.weekly_reports;
CREATE POLICY "Users manage own weekly reports"
  ON public.weekly_reports FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week
  ON public.weekly_reports(user_id, week_start DESC);

-- ============================================================
-- workout_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Dumbbell',
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_templates TO authenticated;
GRANT ALL ON public.workout_templates TO service_role;

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own workout templates" ON public.workout_templates;
CREATE POLICY "Users manage own workout templates"
  ON public.workout_templates FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_touch_workout_templates ON public.workout_templates;
CREATE TRIGGER trg_touch_workout_templates
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- workout_template_exercises
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workout_template_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  superset_group integer,
  default_sets integer,
  default_reps integer,
  default_weight numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_template_exercises TO authenticated;
GRANT ALL ON public.workout_template_exercises TO service_role;

ALTER TABLE public.workout_template_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own template exercises" ON public.workout_template_exercises;
CREATE POLICY "Users manage own template exercises"
  ON public.workout_template_exercises FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_template_exercises_template
  ON public.workout_template_exercises(template_id, position);
