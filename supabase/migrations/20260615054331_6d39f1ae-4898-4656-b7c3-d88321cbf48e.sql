
CREATE TABLE IF NOT EXISTS public.exercise_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight NUMERIC,
  rpe NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_sets_exercise_id_idx ON public.exercise_sets(exercise_id);
CREATE INDEX IF NOT EXISTS exercise_sets_user_id_idx ON public.exercise_sets(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_sets TO authenticated;
GRANT ALL ON public.exercise_sets TO service_role;

ALTER TABLE public.exercise_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own exercise sets" ON public.exercise_sets;
CREATE POLICY "Users manage their own exercise sets"
  ON public.exercise_sets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS exercise_sets_touch_updated_at ON public.exercise_sets;
CREATE TRIGGER exercise_sets_touch_updated_at
  BEFORE UPDATE ON public.exercise_sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
