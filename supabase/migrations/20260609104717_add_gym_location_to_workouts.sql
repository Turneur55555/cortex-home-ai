
-- Ajout de la gestion des salles de sport
-- Rétrocompatible : les séances existantes reçoivent 'Salle inconnue'

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_location TEXT NOT NULL DEFAULT 'Salle inconnue';

-- Index pour filtrer rapidement par salle
CREATE INDEX IF NOT EXISTS idx_workouts_gym_location
  ON public.workouts (user_id, gym_location);

COMMENT ON COLUMN public.workouts.gym_location IS
  'Salle où la séance a été réalisée. Valeurs : Keep Cool, On Air, Salle inconnue (legacy).';
