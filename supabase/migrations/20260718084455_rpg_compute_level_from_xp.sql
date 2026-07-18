-- =====================================================================
-- RPG — Dépendance de R1 : courbe de niveau serveur-autoritaire.
--
-- `compute_level_from_xp` était référencée par R1 (award_character_xp) et par
-- 3 écrans front, mais absente de la base de production (jamais matérialisée
-- par les anciennes migrations, cf. audit-integrite-base-migrations-2026-07-18).
-- Cette migration la (re)crée de façon idempotente et recalcule les niveaux
-- existants. Appliquée en prod le 18/07/2026 (avant R1/S0).
--
-- Courbe : niveau = max(1, floor(sqrt(xp / 100))).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.compute_level_from_xp(_xp integer)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 100.0))::int);
$function$;

-- Recalcule les niveaux existants à partir de l'XP héritée (cohérence immédiate).
UPDATE public.user_stats
SET level = public.compute_level_from_xp(xp),
    updated_at = now();
