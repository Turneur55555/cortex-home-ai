-- Offline-first (architecture globale, cf. CLAUDE.md) — vague Cœur Fitness.
-- Ajoute `updated_at` (+ trigger générique `set_updated_at`, déjà en place,
-- cf. 20260826090000_offline_first_updated_at.sql) sur les tables du cœur
-- séance qui ne l'avaient pas encore, condition nécessaire pour les rendre
-- compatibles avec `createOfflineRepository` (conflict detector).
-- Migration strictement additive et idempotente.

-- ─── workouts ───────────────────────────────────────────────────────────
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workouts_updated_at ON public.workouts;
CREATE TRIGGER trg_workouts_updated_at BEFORE UPDATE ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── exercises ──────────────────────────────────────────────────────────
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_exercises_updated_at ON public.exercises;
CREATE TRIGGER trg_exercises_updated_at BEFORE UPDATE ON public.exercises
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── exercise_sets ──────────────────────────────────────────────────────
ALTER TABLE public.exercise_sets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_exercise_sets_updated_at ON public.exercise_sets;
CREATE TRIGGER trg_exercise_sets_updated_at BEFORE UPDATE ON public.exercise_sets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── workout_template_segments ──────────────────────────────────────────
ALTER TABLE public.workout_template_segments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workout_template_segments_updated_at ON public.workout_template_segments;
CREATE TRIGGER trg_workout_template_segments_updated_at BEFORE UPDATE ON public.workout_template_segments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── workout_template_exercises ─────────────────────────────────────────
ALTER TABLE public.workout_template_exercises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workout_template_exercises_updated_at ON public.workout_template_exercises;
CREATE TRIGGER trg_workout_template_exercises_updated_at BEFORE UPDATE ON public.workout_template_exercises
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── workout_analyses ───────────────────────────────────────────────────
ALTER TABLE public.workout_analyses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workout_analyses_updated_at ON public.workout_analyses;
CREATE TRIGGER trg_workout_analyses_updated_at BEFORE UPDATE ON public.workout_analyses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
