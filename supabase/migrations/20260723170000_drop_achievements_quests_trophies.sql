-- =====================================================================
-- Suppression complète du système de progression secondaire (décision
-- Nathan, 23/07/2026) : Salle des trophées, Succès (Achievements) et
-- Quêtes (Goals). Seule la progression par Niveau/Rang subsiste.
--
-- Ces couches ne versaient déjà plus d'XP (voir migration
-- 20260721130500) — elles n'étaient que prestige/collection/suivi
-- personnel, désormais retirées entièrement, y compris leur mécanique de
-- validation/persistance.
-- =====================================================================

-- ── Triggers d'abord (toute table, y compris celles droppées plus bas) ─
-- Un trigger doit disparaître avant la fonction qu'il exécute, sans quoi
-- le DROP FUNCTION échoue avec "cannot drop function ... because other
-- objects depend on it".
DROP TRIGGER IF EXISTS trg_award_time_of_day_badges ON public.workouts;
DROP TRIGGER IF EXISTS trg_award_xp_on_badge ON public.user_badges;
DROP TRIGGER IF EXISTS goals_award_xp ON public.goals;
DROP TRIGGER IF EXISTS trg_award_xp_on_goal_complete ON public.goals;

-- ── Fonctions (plus aucun trigger/appelant après les DROP ci-dessus) ──
DROP FUNCTION IF EXISTS public.award_time_of_day_badges();
DROP FUNCTION IF EXISTS public.claim_achievement(text, integer);
DROP FUNCTION IF EXISTS public.unlock_user_badge(text);
DROP FUNCTION IF EXISTS public.award_goal_xp();
DROP FUNCTION IF EXISTS public.award_xp_on_badge();
DROP FUNCTION IF EXISTS public.award_xp_on_goal_complete();

-- ── Tables (CASCADE : droppe leurs policies/index/contraintes propres) ─
DROP TABLE IF EXISTS public.user_achievements CASCADE;
DROP TABLE IF EXISTS public.achievement_criteria CASCADE;
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badges_catalog CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;
