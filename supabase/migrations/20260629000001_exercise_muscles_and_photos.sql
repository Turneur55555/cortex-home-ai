-- Migration: muscle groups for custom exercises + user exercise illustrations
-- Date: 2026-06-29

-- 1. Add muscle_groups array to exercises (AI-resolved for custom exercises)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS muscle_groups text[] DEFAULT NULL;

-- 2. Table: user_exercise_illustrations
-- Persists a user-uploaded photo per exercise name across workouts.
CREATE TABLE IF NOT EXISTS public.user_exercise_illustrations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name text        NOT NULL CHECK (char_length(exercise_name) BETWEEN 1 AND 200),
  storage_path  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_name)
);

ALTER TABLE public.user_exercise_illustrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own exercise illustrations" ON public.user_exercise_illustrations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_exercise_illustrations_user
  ON public.user_exercise_illustrations (user_id, exercise_name);

-- 3. Table: workout_analyses
-- Stores the AI post-workout analysis for later review.
CREATE TABLE IF NOT EXISTS public.workout_analyses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id  uuid        NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  summary     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_id)
);

ALTER TABLE public.workout_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workout analyses" ON public.workout_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_workout_analyses_user
  ON public.workout_analyses (user_id, created_at DESC);
