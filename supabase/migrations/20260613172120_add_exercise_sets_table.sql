
-- ============================================================
-- Migration : exercise_sets
-- Objectif  : tracking set-by-set + RPE, additive sur exercises
-- Date      : 2026-06-13
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exercise_sets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id  UUID        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_number   SMALLINT    NOT NULL CHECK (set_number >= 1),
  reps         SMALLINT,
  weight       NUMERIC(6, 2),
  rpe          NUMERIC(3, 1) CHECK (rpe IS NULL OR (rpe >= 1.0 AND rpe <= 10.0)),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (exercise_id, set_number)
);

-- Index pour les requêtes par exercice
CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise_id ON public.exercise_sets (exercise_id);

-- Index pour les requêtes par user (RLS check rapide)
CREATE INDEX IF NOT EXISTS idx_exercise_sets_user_id ON public.exercise_sets (user_id);

-- Activation RLS
ALTER TABLE public.exercise_sets ENABLE ROW LEVEL SECURITY;

-- Policy : chaque user voit et gère uniquement ses propres sets
DROP POLICY IF EXISTS "Users manage own exercise sets" ON public.exercise_sets;
CREATE POLICY "Users manage own exercise sets"
  ON public.exercise_sets
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
