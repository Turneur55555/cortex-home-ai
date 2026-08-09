-- =====================================================================
-- Suppression définitive des Saisons (décision Nathan, 29/08/2026)
--
-- Les Saisons ont été retirées de l'interface (SeasonTrackCard.tsx sans
-- importeur) mais étaient restées vivantes côté serveur : trigger actif
-- sur workouts, 3 tables, 2 fonctions. Ce chantier RPG V2 abandonne
-- définitivement la mécanique de Saison — "Ascension" redevient
-- exclusivement le passage d'un Titre au Titre supérieur.
--
-- Audit de dépendances effectué avant suppression (voir session) :
--   - Seul le trigger trg_award_sp_on_workout_complete (sur workouts)
--     référence ce système ; aucun autre trigger/vue ne le touche.
--   - Seules les fonctions award_season_points() et
--     award_sp_on_workout_complete() référencent sp_events/seasons/
--     user_season_progress (grep sur pg_get_functiondef de TOUTES les
--     fonctions public) — aucune autre fonction serveur n'en dépend.
--   - Aucune autre table n'a de FK vers seasons/sp_events/
--     user_season_progress (seules les FK internes au système lui-même :
--     sp_events.season_id et user_season_progress.season_id → seasons.id).
--   - sp_events (575 lignes) ne contient qu'une seule source
--     ('workout_muscu') : un doublon d'engagement de xp_events
--     (workout_muscu), pas une donnée fitness primaire — aucune perte de
--     donnée d'entraînement réelle (workouts/exercises/exercise_sets
--     intacts).
--   - Aucune colonne d'une autre table n'est exclusivement liée aux
--     Saisons (workouts n'a aucune colonne season_*).
-- =====================================================================

-- ── 1. Trigger sur workouts ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_award_sp_on_workout_complete ON public.workouts;

-- ── 2. Fonctions ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.award_sp_on_workout_complete();
DROP FUNCTION IF EXISTS public.award_season_points(uuid, uuid, text, integer, uuid);
DROP FUNCTION IF EXISTS public.compute_season_tier(integer);

-- ── 3. Tables (ordre : dépendants d'abord) ──────────────────────────
DROP TABLE IF EXISTS public.sp_events;
DROP TABLE IF EXISTS public.user_season_progress;
DROP TABLE IF EXISTS public.seasons;
