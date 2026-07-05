-- ═══ 1. Colonnes manquantes ═══
alter table public.users_profiles add column if not exists avatar_url text;
alter table public.goals add column if not exists start_value numeric;
alter table public.goals add column if not exists xp_awarded boolean not null default false;

-- ═══ 2. Bucket avatars (lecture publique, écriture limitée au dossier de l'utilisateur) ═══
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══ 3. Neutralisation du bucket paie-documents (public → privé, vide, policies retirées) ═══
-- La suppression définitive du bucket doit se faire via le dashboard (Storage API).
drop policy if exists "upload paie-documents" on storage.objects;
drop policy if exists "delete paie-documents" on storage.objects;
update storage.buckets set public = false where id = 'paie-documents';

-- ═══ 4. Bucket backups (privé, service role uniquement — aucune policy = aucun accès client) ═══
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- ═══ 5. Stats fitness serveur (source de vérité pour badges + streak) ═══
create or replace function public.compute_fitness_stats(_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _today date := (now() at time zone 'Europe/Paris')::date;
  _week_start date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  _workouts_count int;
  _weekly int;
  _streak int := 0;
  _protein_days int;
  _protein_target numeric;
  _goals_done int;
  _body_count int;
  _cursor date;
  _active_days date[];
begin
  select count(*) into _workouts_count from workouts where user_id = _uid;
  select count(*) into _weekly from workouts where user_id = _uid and date >= _week_start;
  select count(*) into _body_count from body_tracking where user_id = _uid;
  select count(*) into _goals_done from goals where user_id = _uid and is_completed = true;

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
    'goals_completed', _goals_done,
    'body_measurements', _body_count
  );
end;
$$;

revoke execute on function public.compute_fitness_stats(uuid) from anon;

-- RPC front : streak de l'utilisateur courant
create or replace function public.get_user_streak_days()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select (compute_fitness_stats(auth.uid())->>'streak_days')::int;
$$;

revoke execute on function public.get_user_streak_days() from anon;

-- ═══ 6. unlock_user_badge : validation des critères CÔTÉ SERVEUR ═══
create or replace function public.unlock_user_badge(_badge_key text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _user_id uuid := auth.uid();
  _badge   badges_catalog%rowtype;
  _stats   jsonb;
  _current numeric;
begin
  if _user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into _badge from badges_catalog where badge_key = _badge_key;
  if not found then
    raise exception 'Badge not found: %', _badge_key;
  end if;

  if exists(select 1 from user_badges where user_id = _user_id and badge_key = _badge_key) then
    return;
  end if;

  -- Validation serveur : le critère doit être réellement atteint
  _stats := compute_fitness_stats(_user_id);
  _current := coalesce((_stats->>_badge.requirement_type)::numeric, 0);
  if _current < _badge.requirement_value then
    raise exception 'Criteria not met for %: % < %', _badge_key, _current, _badge.requirement_value;
  end if;

  insert into user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  values (_user_id, _badge_key, _badge.label, _badge.icon, _badge.rarity, _badge.xp_reward, _badge.description)
  on conflict do nothing;

  insert into user_stats (user_id, xp, level, total_actions)
  values (_user_id, _badge.xp_reward, 1, 0)
  on conflict (user_id) do update
    set xp = user_stats.xp + _badge.xp_reward,
        level = greatest(1, floor(sqrt((user_stats.xp + _badge.xp_reward)::float / 100))::int + 1),
        updated_at = now();
end;
$$;

-- ═══ 7. XP des objectifs : versé automatiquement à la complétion (une seule fois) ═══
create or replace function public.award_goal_xp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_completed = true and old.is_completed = false and new.xp_awarded = false then
    new.xp_awarded := true;
    insert into user_stats (user_id, xp, level, total_actions)
    values (new.user_id, coalesce(new.xp_reward, 0), 1, 0)
    on conflict (user_id) do update
      set xp = user_stats.xp + coalesce(new.xp_reward, 0),
          level = greatest(1, floor(sqrt((user_stats.xp + coalesce(new.xp_reward, 0))::float / 100))::int + 1),
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists goals_award_xp on public.goals;
create trigger goals_award_xp
  before update on public.goals
  for each row execute function public.award_goal_xp();

notify pgrst, 'reload schema';
