
-- Statut séance : 'active' = en cours, 'completed' = terminée
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_status_check;

ALTER TABLE workouts
  ADD CONSTRAINT workouts_status_check
  CHECK (status IN ('active', 'completed'));

-- Champs supplémentaires sur les séries
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS tempo TEXT;

ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS rest_seconds SMALLINT;

-- Index pour retrouver rapidement la séance active
CREATE INDEX IF NOT EXISTS idx_workouts_status
  ON workouts (user_id, status)
  WHERE status = 'active';
