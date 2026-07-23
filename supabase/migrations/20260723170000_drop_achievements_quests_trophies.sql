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

-- ── Trigger sur workouts (hors des tables droppées ci-dessous) ────────
DROP TRIGGER IF EXISTS trg_award_time_of_day_badges ON public.workouts;
DROP FUNCTION IF EXISTS public.award_time_of_day_badges();

-- ── Fonctions RPC dédiées (plus aucun appelant côté client) ───────────
DROP FUNCTION IF EXISTS public.claim_achievement(text, integer);
DROP FUNCTION IF EXISTS public.unlock_user_badge(text);
DROP FUNCTION IF EXISTS public.award_goal_xp();
DROP FUNCTION IF EXISTS public.award_xp_on_badge();
DROP FUNCTION IF EXISTS public.award_xp_on_goal_complete();

-- ── Tables (CASCADE : droppe leurs triggers/policies/index propres) ───
DROP TABLE IF EXISTS public.user_achievements CASCADE;
DROP TABLE IF EXISTS public.achievement_criteria CASCADE;
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badges_catalog CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;
