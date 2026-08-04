-- ══════════════════════════════════════════════════════════════════════════════
-- FIX : compute_fitness_stats() référence encore la table `goals`, supprimée
-- le 23/07/2026 (migration 20260723170000_drop_achievements_quests_trophies.sql).
--
-- Cause exacte (investigation Health Check du 04/08/2026) : `DROP TABLE
-- public.goals CASCADE` n'a jamais cassé cette fonction PL/pgSQL au moment du
-- drop car Postgres ne valide pas le corps d'une fonction plpgsql au moment du
-- CREATE/DROP (résolution des noms différée à l'exécution) — aucune entrée
-- pg_depend, donc rien à CASCADE. La ligne `select count(*) into _goals_done
-- from goals where user_id = _uid and is_completed = true;` n'a donc échoué
-- qu'à l'exécution, silencieusement côté serveur, à chaque appel de
-- get_user_streak_days() (RPC utilisée par src/hooks/useActivityStreak.ts,
-- fonctionnalité active) : "relation \"goals\" does not exist", plusieurs fois
-- par heure depuis le 23/07/2026, remonté par erreur comme un problème de
-- cache client dans une investigation précédente.
--
-- `goals_completed` (issu de _goals_done) n'est lu nulle part côté frontend
-- (vérifié par grep exhaustif sur src/) — retrait pur, aucune donnée
-- supprimée, aucun changement de comportement visible pour l'utilisateur.
-- ══════════════════════════════════════════════════════════════════════════════

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
