-- Module Séances — audit 02/07/2026 :
-- 1. `workouts.status` devient la source de vérité de la séance active (C3).
-- 2. Backfill : les séries des séances déjà clôturées sont marquées validées (H3).
-- 3. Suppression du RPE (décision Nathan 02/07/2026 : pas de RPE dans l'app).

-- 1. Statuts cohérents avec l'existant
UPDATE public.workouts
SET status = 'completed'
WHERE duration_minutes IS NOT NULL AND status <> 'completed';

UPDATE public.workouts
SET status = 'active'
WHERE duration_minutes IS NULL AND status <> 'active';

-- 2. Backfill completed=true sur les séries des séances terminées
UPDATE public.exercise_sets s
SET completed = true
FROM public.exercises e
JOIN public.workouts w ON w.id = e.workout_id
WHERE s.exercise_id = e.id
  AND w.status = 'completed'
  AND s.completed = false;

-- 3. Suppression de la colonne rpe (0 valeur non nulle vérifiée le 02/07/2026)
ALTER TABLE public.exercise_sets DROP COLUMN IF EXISTS rpe;

-- Recharge du cache PostgREST
NOTIFY pgrst, 'reload schema';
