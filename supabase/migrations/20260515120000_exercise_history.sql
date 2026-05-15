-- Exercise history: tracks last-used weight/reps/sets per exercise name per user.
-- Used to pre-fill exercise fields and surface recent exercises in the picker.

CREATE TABLE IF NOT EXISTS public.exercise_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name text        NOT NULL CHECK (char_length(exercise_name) BETWEEN 1 AND 200),
  last_sets     int         CHECK (last_sets >= 1 AND last_sets <= 100),
  last_reps     int         CHECK (last_reps >= 1 AND last_reps <= 10000),
  last_weight   float       CHECK (last_weight >= 0 AND last_weight <= 1000),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  usage_count   int         NOT NULL DEFAULT 1,
  UNIQUE (user_id, exercise_name)
);

ALTER TABLE public.exercise_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own exercise history"
  ON public.exercise_history
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_history_user_recent
  ON public.exercise_history (user_id, last_used_at DESC);
