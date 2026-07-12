-- Add exercise_reference table (shared exercise catalog) and exercise_reference_id FK on exercises
CREATE TABLE IF NOT EXISTS public.exercise_reference (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  discipline_id text NOT NULL DEFAULT 'muscu',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discipline_id, name)
);

GRANT SELECT ON public.exercise_reference TO anon, authenticated;
GRANT ALL ON public.exercise_reference TO service_role;

ALTER TABLE public.exercise_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_reference readable by everyone" ON public.exercise_reference;
CREATE POLICY "exercise_reference readable by everyone"
  ON public.exercise_reference FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "exercise_reference authenticated insert" ON public.exercise_reference;
CREATE POLICY "exercise_reference authenticated insert"
  ON public.exercise_reference FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "exercise_reference authenticated update" ON public.exercise_reference;
CREATE POLICY "exercise_reference authenticated update"
  ON public.exercise_reference FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exercise_reference authenticated delete" ON public.exercise_reference;
CREATE POLICY "exercise_reference authenticated delete"
  ON public.exercise_reference FOR DELETE
  TO authenticated USING (true);

-- Add missing FK column on exercises
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_reference_id uuid REFERENCES public.exercise_reference(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exercises_exercise_reference_id_idx
  ON public.exercises (exercise_reference_id);