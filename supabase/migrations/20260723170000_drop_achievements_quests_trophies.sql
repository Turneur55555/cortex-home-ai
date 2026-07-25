-- =====================================================================
-- Suppression complète du système de progression secondaire (décision
-- Nathan, 23/07/2026) : Salle des trophées, Succès (Achievements) et
-- Quêtes (Goals). Seule la progression par Niveau/Rang subsiste.
--
-- Ces couches ne versaient déjà plus d'XP (voir migration
-- 20260721130500) — elles n'étaient que prestige/collection/suivi
-- personnel, désormais retirées entièrement, y compris leur mécanique de
-- validation/persistance.
--
-- Fix (25/07/2026) : la version initiale tentait DROP FUNCTION
-- award_goal_xp() AVANT DROP TABLE goals, alors que le trigger
-- goals_award_xp (sur la table goals) dépend de cette fonction —
-- Postgres refuse (2BP01: object depends on it). Vérifié via pg_depend :
-- goals_award_xp est l'UNIQUE dépendant de award_goal_xp() sur toute la
-- base (aucune vue, aucune autre fonction) ; claim_achievement() et
-- unlock_user_badge() n'ont, elles, aucun dépendant. Comme `goals` est de
-- toute façon supprimée par cette même migration, il suffit de supprimer
-- les tables (CASCADE : emporte leurs triggers propres, dont
-- goals_award_xp) AVANT les fonctions — plus besoin de CASCADE sur les
-- DROP FUNCTION, qui n'ont alors plus aucun dépendant. Vérifié également
-- qu'aucune autre table ne référence ces 5 tables par clé étrangère.
-- =====================================================================

-- ── Trigger sur workouts (hors des tables droppées ci-dessous) ────────
DROP TRIGGER IF EXISTS trg_award_time_of_day_badges ON public.workouts;
DROP FUNCTION IF EXISTS public.award_time_of_day_badges();

-- ── Tables (CASCADE : droppe leurs triggers/policies/index propres,
--       dont goals_award_xp sur `goals`) — AVANT les fonctions ci-après,
--       qui n'ont alors plus aucun dépendant ─────────────────────────
DROP TABLE IF EXISTS public.user_achievements CASCADE;
DROP TABLE IF EXISTS public.achievement_criteria CASCADE;
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badges_catalog CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;

-- ── Fonctions RPC dédiées (plus aucun appelant côté client, plus aucun
--       trigger dépendant maintenant que les tables ci-dessus sont
--       supprimées) ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.claim_achievement(text, integer);
DROP FUNCTION IF EXISTS public.unlock_user_badge(text);
DROP FUNCTION IF EXISTS public.award_goal_xp();
DROP FUNCTION IF EXISTS public.award_xp_on_badge();
DROP FUNCTION IF EXISTS public.award_xp_on_goal_complete();
