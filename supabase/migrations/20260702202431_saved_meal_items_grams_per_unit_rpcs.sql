-- Bug B8 : conserver les grammes/unité (scoop, pot…) dans les repas enregistrés
-- pour que l'édition de portion après re-log utilise la vraie référence.

alter table public.saved_meal_items add column if not exists consumed_grams_per_unit double precision;

create or replace function public.create_saved_meal(p_name text, p_meal text default null::text, p_items jsonb default '[]'::jsonb)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
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
      serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit, sort_order)
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
      nullif(v_item->>'consumed_grams_per_unit','')::double precision,
      v_order
    );
    v_order := v_order + 1;
  end loop;
  return v_id;
end;
$function$;

create or replace function public.log_saved_meal(p_meal_id uuid, p_date date default current_date, p_meal text default null::text)
returns integer
language plpgsql
set search_path to 'public'
as $function$
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
    serving_count, percentage_consumed, consumed_quantity, consumed_unit, consumed_grams_per_unit)
  select
    auth.uid(), p_date,
    coalesce(p_meal, (select meal from public.saved_meals where id = p_meal_id)),
    i.name, i.calories, i.proteins, i.carbs, i.fats,
    i.base_calories, i.base_proteins, i.base_carbs, i.base_fats,
    coalesce(i.serving_count, 1), 100, i.consumed_quantity, i.consumed_unit, i.consumed_grams_per_unit
  from public.saved_meal_items i
  where i.saved_meal_id = p_meal_id
  order by i.sort_order;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
