-- SECURITY FIX — HIGH (audit du 16/08/2026) : CTX-04, CTX-05, CTX-07.
--
-- CTX-04 — compute_fitness_stats(_uid)/compute_achievement_stats(_uid) sont
-- SECURITY DEFINER, acceptent un uuid en paramètre sans jamais le comparer
-- à l'appelant, et étaient exécutables par le rôle anon : un attaquant
-- connaissant l'UUID d'un utilisateur pouvait lire ses statistiques de
-- fitness sans aucune session. Seul appelant légitime identifié dans le
-- code : get_user_streak_days() (SECURITY DEFINER), qui appelle déjà
-- compute_fitness_stats(auth.uid()) — le garde-fou ajouté ci-dessous est
-- donc strictement compatible avec cet appel imbriqué (le contexte
-- SECURITY DEFINER couvre l'appel interne). Aucun appel client direct
-- (`.rpc("compute_fitness_stats"...)`) n'existe dans le dépôt.
--
-- CTX-05 — Les 6 RPC de gestion du catalogue d'exercices (fusion, archivage,
-- restauration, suppression) sont SECURITY DEFINER sans aucune vérification
-- d'identité, et exécutables par anon ET authenticated. Elles sont
-- exclusivement appelées par les edge functions admin-exercise-actions et
-- restore-exercises-dataset-import via un client service_role (vérifié :
-- aucun appel `.rpc(...)` direct depuis le code client React). Restreindre
-- l'EXECUTE à service_role ne casse donc aucun usage légitime — la garde
-- d'identité (email admin) reste dans l'edge function, ceci ferme le
-- contournement direct via PostgREST.
--
-- CTX-07 — run_weekly_backups() (SECURITY DEFINER, boucle sur TOUS les
-- utilisateurs et exporte l'intégralité de leurs données) était exécutable
-- par anon : un appel POST /rest/v1/rpc/run_weekly_backups sans session
-- déclenchait un export complet de la base, à volonté (déni de service).
-- Aucune tâche planifiée ni edge function ne l'appelle actuellement dans le
-- dépôt (mécanisme prévu mais pas encore branché) ; restreindre à
-- service_role est donc sans régression et couvre le futur job planifié.
--
-- CTX-06 (catalogue d'exercices en écriture directe cliente) N'EST PAS
-- traité par cette migration — voir le rapport de remédiation : il s'agit
-- d'une fonctionnalité intentionnelle (src/hooks/useExerciseCatalog.ts,
-- gestion du catalogue partagé par tout utilisateur connecté, cohérente
-- avec l'absence assumée de système de rôles pour une application à
-- propriétaire unique — voir supabase/functions/_shared/adminAuth.ts). La
-- retirer casserait une fonctionnalité réelle sans demande explicite ;
-- décision produit à trancher par un humain, pas par cet audit.

-- ── CTX-04 ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_fitness_stats(_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _today date := (now() at time zone 'Europe/Paris')::date;
  _week_start date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  _workouts_count int;
  _weekly int;
  _streak int := 0;
  _protein_days int;
  _protein_target numeric;
  _body_count int;
  _cursor date;
  _active_days date[];
begin
  if auth.uid() is null or auth.uid() <> _uid then
    raise exception 'Accès refusé';
  end if;

  select count(*) into _workouts_count from workouts where user_id = _uid;
  select count(*) into _weekly from workouts where user_id = _uid and date >= _week_start;
  select count(*) into _body_count from body_tracking where user_id = _uid;

  select coalesce(proteins, 150) into _protein_target
    from nutrition_goals where user_id = _uid;
  if _protein_target is null then _protein_target := 150; end if;

  select count(*) into _protein_days from (
    select date from nutrition
    where user_id = _uid and date >= _today - 30
    group by date
    having sum(coalesce(proteins, 0)) >= _protein_target
  ) d;

  -- Jours actifs = séance OU repas loggé OU mensuration
  select array_agg(distinct d) into _active_days from (
    select date as d from workouts where user_id = _uid
    union
    select date from nutrition where user_id = _uid
    union
    select date from body_tracking where user_id = _uid
  ) t;

  -- Streak = jours consécutifs se terminant aujourd'hui (ou hier, pour ne pas casser à minuit)
  if _active_days is not null then
    _cursor := case
      when _today = any(_active_days) then _today
      when (_today - 1) = any(_active_days) then _today - 1
      else null
    end;
    while _cursor is not null and _cursor = any(_active_days) loop
      _streak := _streak + 1;
      _cursor := _cursor - 1;
    end loop;
  end if;

  return jsonb_build_object(
    'workouts_count', _workouts_count,
    'weekly_workouts', _weekly,
    'streak_days', _streak,
    'protein_days', _protein_days,
    'body_measurements', _body_count
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_fitness_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_fitness_stats(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compute_achievement_stats(_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _base               jsonb;
  _distinct_months    int;
  _total_volume       numeric;
  _total_sets         int;
  _total_reps         numeric;
  _distinct_exercises int;
  _guided_count       int;
  _course_count       int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _uid THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  _base := public.compute_fitness_stats(_uid);

  SELECT COUNT(DISTINCT date_trunc('month', date)) INTO _distinct_months
    FROM public.workouts WHERE user_id = _uid;

  SELECT COALESCE(SUM(s.weight * s.reps), 0), COUNT(*), COALESCE(SUM(s.reps), 0)
    INTO _total_volume, _total_sets, _total_reps
    FROM public.exercise_sets s
    WHERE s.user_id = _uid;

  SELECT COUNT(DISTINCT COALESCE(e.exercise_reference_id::text, lower(btrim(e.name))))
    INTO _distinct_exercises
    FROM public.exercises e
    WHERE e.user_id = _uid;

  SELECT COUNT(*) INTO _guided_count
    FROM public.workouts WHERE user_id = _uid AND discipline = 'guided';
  SELECT COUNT(*) INTO _course_count
    FROM public.workouts WHERE user_id = _uid AND discipline = 'course';

  RETURN _base || jsonb_build_object(
    'distinct_months_active', _distinct_months,
    'total_volume_kg', _total_volume,
    'total_sets', _total_sets,
    'total_reps', _total_reps,
    'distinct_exercise_count', _distinct_exercises,
    'guided_sessions_count', _guided_count,
    'course_sessions_count', _course_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_achievement_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_achievement_stats(uuid) TO authenticated, service_role;

-- ── CTX-05 ───────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.merge_exercise_references(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_exercise_references(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.undo_exercise_merge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_exercise_merge(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.archive_exercise_reference(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_exercise_reference(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.restore_exercise_reference(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_exercise_reference(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_exercise_reference_if_unused(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exercise_reference_if_unused(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.restore_exercise_reference_import(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_exercise_reference_import(uuid) TO service_role;

-- ── CTX-07 ───────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.run_weekly_backups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_weekly_backups() TO service_role;
