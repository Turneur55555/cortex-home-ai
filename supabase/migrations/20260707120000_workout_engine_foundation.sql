-- ============================================================
-- Fondation de l'architecture à moteurs du module Séances (phase 1).
--
-- Additif et rétrocompatible : aucune colonne existante n'est modifiée
-- ou supprimée. Toute séance existante devient explicitement 'muscu'
-- (comportement identique à aujourd'hui, juste rendu explicite).
--
-- discipline : discriminant léger, pas de contrainte CHECK figée pour
-- ne pas devoir migrer à chaque nouvelle discipline (validée côté
-- application par DisciplineId dans src/lib/fitness/engines/types.ts).
--
-- metadata : données structurées propres à chaque discipline (distance,
-- allure, blocs HYROX, zones FC...). JAMAIS lu par le moteur de Rang,
-- de Maîtrise, de Badges ou de Succès — ces moteurs ne lisent que
-- exercises/exercise_sets, qui restent réservés à la musculation.
-- ============================================================

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'muscu';

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workouts_discipline
  ON public.workouts (user_id, discipline);

COMMENT ON COLUMN public.workouts.discipline IS
  'Discipline ayant produit la séance : muscu (actif), hyrox, course, cardio, guided (à venir). Rétrocompatible : toutes les séances existantes = muscu.';

COMMENT ON COLUMN public.workouts.metadata IS
  'Données structurées propres à la discipline (distance, allure, blocs HYROX, zones FC...). Jamais lu par le moteur de Rang/Maîtrise/Badges/Succès, qui reste strictement scopé à exercises/exercise_sets.';
