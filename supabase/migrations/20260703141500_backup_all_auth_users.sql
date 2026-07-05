create or replace function public.run_weekly_backups()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _uid uuid;
  _tbl text;
  _payload jsonb;
  _part jsonb;
  _count int := 0;
begin
  for _uid in select id from auth.users loop
    _payload := jsonb_build_object(
      'exported_at', now(),
      'user_id', _uid,
      'profile', (select to_jsonb(p) from public.users_profiles p where p.id = _uid)
    );

    for _tbl in
      select c.table_name from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'user_id'
        and c.table_name not in ('ai_cache', 'rate_limits', 'error_logs', 'data_backups')
      order by 1
    loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.user_id = $1',
        _tbl
      ) into _part using _uid;
      _payload := _payload || jsonb_build_object(_tbl, _part);
    end loop;

    insert into public.data_backups (user_id, payload) values (_uid, _payload);
    _count := _count + 1;

    delete from public.data_backups db
    where db.user_id = _uid
      and db.id not in (
        select id from public.data_backups
        where user_id = _uid order by created_at desc limit 8
      );
  end loop;
  return _count;
end;
$$;
