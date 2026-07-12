ALTER TABLE public.workout_segments
  ADD COLUMN IF NOT EXISTS discipline text,
  ADD COLUMN IF NOT EXISTS exercise_id uuid REFERENCES public.exercise_reference(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_segments_exercise_id_idx
  ON public.workout_segments (exercise_id);