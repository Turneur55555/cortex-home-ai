
-- Repas enregistrés (modèles multi-aliments) + log 1-tap vers nutrition (Stack A)
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  meal text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  calories integer,
  proteins double precision,
  carbs double precision,
  fats double precision,
  base_calories double precision,
  base_proteins double precision,
  base_carbs double precision,
  base_fats double precision,
  serving_count double precision default 1,
  consumed_quantity double precision,
  consumed_unit text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_meals_user on public.saved_meals(user_id);
create index if not exists idx_saved_meal_items_meal on public.saved_meal_items(saved_meal_id);

alter table public.saved_meals enable row level security;
alter table public.saved_meal_items enable row level security;

drop policy if exists saved_meals_select_own on public.saved_meals;
drop policy if exists saved_meals_insert_own on public.saved_meals;
drop policy if exists saved_meals_update_own on public.saved_meals;
drop policy if exists saved_meals_delete_own on public.saved_meals;
create policy saved_meals_select_own on public.saved_meals for select using (user_id = auth.uid());
create policy saved_meals_insert_own on public.saved_meals for insert with check (user_id = auth.uid());
create policy saved_meals_update_own on public.saved_meals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_meals_delete_own on public.saved_meals for delete using (user_id = auth.uid());

drop policy if exists saved_meal_items_select_own on public.saved_meal_items;
drop policy if exists saved_meal_items_insert_own on public.saved_meal_items;
drop policy if exists saved_meal_items_update_own on public.saved_meal_items;
drop policy if exists saved_meal_items_delete_own on public.saved_meal_items;
create policy saved_meal_items_select_own on public.saved_meal_items for select using (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.user_id = auth.uid()));
create policy saved_meal_items_insert_own on public.saved_meal_items for insert with check (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.user_id = auth.uid()));
create policy saved_meal_items_update_own on public.saved_meal_items for update using (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.user_id = auth.uid()));
create policy saved_meal_items_delete_own on public.saved_meal_items for delete using (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.user_id = auth.uid()));

-- Création atomique d'un repas enregistré + ses items (SECURITY INVOKER : RLS s'applique)
create or replace function public.create_saved_meal(p_name text, p_meal text default null, p_items jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $func$
declare
  v_id uuid;
  v_item jsonb;
  v_order smallint := 0;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required'; end if;
  insert into public.saved_meals(user_id, name, meal) values (auth.uid(), p_name, p_meal) returning id into v_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.saved_meal_items(
      saved_meal_id, food_id, name, calories, proteins, carbs, fats,
      base_calories, base_proteins, base_carbs, base_fats,
      serving_count, consumed_quantity, consumed_unit, sort_order)
    values (
      v_id,
      nullif(v_item->>'food_id','')::uuid,
      coalesce(v_item->>'name',''),
      nullif(v_item->>'calories','')::integer,
      nullif(v_item->>'proteins','')::double precision,
      nullif(v_item->>'carbs','')::double precision,
      nullif(v_item->>'fats','')::double precision,
      nullif(v_item->>'base_calories','')::double precision,
      nullif(v_item->>'base_proteins','')::double precision,
      nullif(v_item->>'base_carbs','')::double precision,
      nullif(v_item->>'base_fats','')::double precision,
      coalesce(nullif(v_item->>'serving_count','')::double precision, 1),
      nullif(v_item->>'consumed_quantity','')::double precision,
      nullif(v_item->>'consumed_unit',''),
      v_order
    );
    v_order := v_order + 1;
  end loop;
  return v_id;
end;
$func$;

-- Log 1-tap : insère un repas enregistré dans le journal nutrition pour une date/un moment
create or replace function public.log_saved_meal(p_meal_id uuid, p_date date default current_date, p_meal text default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $func$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.saved_meals m where m.id = p_meal_id and m.user_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  insert into public.nutrition(
    user_id, date, meal, name, calories, proteins, carbs, fats,
    base_calories, base_proteins, base_carbs, base_fats,
    serving_count, percentage_consumed, consumed_quantity, consumed_unit)
  select
    auth.uid(), p_date,
    coalesce(p_meal, (select meal from public.saved_meals where id = p_meal_id), 'Repas'),
    i.name, i.calories, i.proteins, i.carbs, i.fats,
    i.base_calories, i.base_proteins, i.base_carbs, i.base_fats,
    coalesce(i.serving_count, 1), 100, i.consumed_quantity, i.consumed_unit
  from public.saved_meal_items i
  where i.saved_meal_id = p_meal_id
  order by i.sort_order;
  get diagnostics v_count = row_count;
  return v_count;
end;
$func$;

notify pgrst, 'reload schema';
