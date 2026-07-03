-- Perf P3 : agrégation des aliments fréquents côté SQL
-- (remplace le chargement de 300 lignes + agrégation client dans useFrequentFoods).

create or replace function public.frequent_foods(p_days integer default 30, p_limit integer default 6)
returns table (
  name text,
  cnt bigint,
  calories double precision,
  proteins double precision,
  carbs double precision,
  fats double precision
)
language sql
stable
set search_path to 'public'
as $$
  with recent as (
    select
      n.name,
      lower(btrim(n.name)) as k,
      coalesce(n.base_calories, n.calories::double precision) as cal,
      coalesce(n.base_proteins, n.proteins) as prot,
      coalesce(n.base_carbs, n.carbs) as carb,
      coalesce(n.base_fats, n.fats) as fat,
      n.created_at
    from public.nutrition n
    where n.user_id = auth.uid()
      and n.date >= current_date - p_days
      and n.name is not null
      and length(btrim(n.name)) >= 2
  ),
  counts as (
    select k, count(*) as cnt from recent group by k
  )
  select r.name, c.cnt, r.cal, r.prot, r.carb, r.fat
  from counts c
  join lateral (
    select * from recent where recent.k = c.k order by recent.created_at desc limit 1
  ) r on true
  order by c.cnt desc, r.name asc
  limit p_limit;
$$;
