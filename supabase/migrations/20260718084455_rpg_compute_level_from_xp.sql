-- Dépendance de R1 (award_character_xp) : courbe de niveau serveur-autoritaire.
-- Définition canonique (repo 20260704110408). Idempotent.
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
