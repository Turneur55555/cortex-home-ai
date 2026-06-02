CREATE OR REPLACE FUNCTION public.compute_level_from_xp(_xp integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 50.0))::int + 1);
$function$;