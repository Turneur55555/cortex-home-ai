ALTER TABLE public.exercise_sets
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
