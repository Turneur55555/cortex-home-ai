-- =====================================================================
-- Abandon des Saisons + nettoyage des tables mortes (décision Nathan,
-- 30/09/2026).
--
-- ── 1. SAISONS ───────────────────────────────────────────────────────
-- Le système de Saisons est définitivement supprimé de CORTEX. Le pilier
-- RPG « aller au bout de la saison » a été retiré de CLAUDE.md en même
-- temps (voir docs/INVARIANTS.md §3.4).
--
-- ⚠️ CONSTAT VÉRIFIÉ EN DIRECT SUR LA BASE DE PRODUCTION LE 30/09/2026 :
-- la migration 20260717130000_rpg_seasons_s0 est bien INSCRITE dans
-- supabase_migrations.schema_migrations, mais AUCUN de ses objets
-- n'existe — ni les 3 tables, ni les 2 fonctions. Les Saisons n'ont donc
-- JAMAIS tourné en production : aucun Point de Saison n'a été versé à
-- quiconque, et aucune donnée utilisateur n'est perdue ici.
--
-- Cette migration est donc un NO-OP sur la production. Elle existe
-- quand même, pour deux raisons :
--   a) rendre l'abandon explicite et daté dans l'historique du schéma
--      plutôt que de le laisser deviner par l'absence de code ;
--   b) couvrir toute AUTRE base (branche Supabase, preview, restauration
--      d'un dump antérieur) où la migration S0 aurait, elle, réellement
--      créé ces objets.
--
-- Le fichier 20260717130000_rpg_seasons_s0.sql n'est PAS supprimé du
-- dépôt : sa version est inscrite en base, et
-- `scripts/audit-migration-drift.mjs` signale précisément les migrations
-- « supprimées dans Git mais présentes en base ». On ajoute, on ne
-- réécrit pas l'historique.
--
-- ── 2. TABLES MORTES ────────────────────────────────────────────────
-- Trois tables sans aucun code appelant depuis des mois :
--   - training_programs / program_weeks : vestiges de la périodisation
--     du Coach IA V2, retirée du code (plus aucun hook `usePrograms`) ;
--   - reminders : vestige du module de rappels, retiré de l'UI.
-- COMPTAGE VÉRIFIÉ AVANT ÉCRITURE DE CETTE MIGRATION, sur la production :
-- training_programs = 0 ligne, program_weeks = 0 ligne, reminders =
-- 0 ligne. Aucune donnée utilisateur n'est détruite.
--
-- Ordre imposé par la seule clé étrangère existante
-- (program_weeks.program_id -> training_programs) : l'enfant d'abord.
-- CASCADE emporte policies, index et triggers propres à chaque table.
--
-- Idempotente (IF EXISTS partout) : rejouable sans erreur.
-- =====================================================================

-- ── 1. Saisons ───────────────────────────────────────────────────────

-- Trigger de versement des Points de Saison, posé par la migration S0
-- sur `workouts` — donc HORS des tables droppées ci-dessous, à retirer
-- explicitement (sinon un DROP FUNCTION sans CASCADE échouerait).
DROP TRIGGER IF EXISTS trg_award_sp_on_workout_complete ON public.workouts;
DROP FUNCTION IF EXISTS public.award_sp_on_workout_complete();

-- Tables du système, enfants d'abord (sp_events et user_season_progress
-- référencent seasons).
DROP TABLE IF EXISTS public.sp_events CASCADE;
DROP TABLE IF EXISTS public.user_season_progress CASCADE;
DROP TABLE IF EXISTS public.seasons CASCADE;

-- Fonctions du système : plus aucun dépendant une fois les tables
-- supprimées.
-- Signatures reprises À L'IDENTIQUE de 20260717130000_rpg_seasons_s0.sql :
-- un DROP FUNCTION sans la bonne liste d'arguments ne supprime rien.
DROP FUNCTION IF EXISTS public.award_season_points(uuid, uuid, text, integer, uuid);
DROP FUNCTION IF EXISTS public.compute_season_tier(integer);

-- ── 2. Tables mortes ────────────────────────────────────────────────

DROP TABLE IF EXISTS public.program_weeks CASCADE;
DROP TABLE IF EXISTS public.training_programs CASCADE;
DROP TABLE IF EXISTS public.reminders CASCADE;
