-- Refactor bibliothèque des repas : édition et duplication d'un repas enregistré
-- depuis Nutrition → Mes aliments → Repas (fusion de l'ancien écran "Mes repas
-- enregistrés" dans FoodLibrarySheet). Symétrique de create_saved_meal :
-- remplace intégralement les items (delete + reinsert) pour rester simple et
-- cohérent avec la convention base_* = valeurs /100 g.

create or replace function public.update_saved_meal(
  p_id uuid,
  p_name text,
  p_meal text default null::text,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_order smallint := 0;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required'; end if;
  if not exists (select 1 from public.saved_meals m where m.id = p_id and m.user_id = auth.uid()) then
    raise exception 'not_found';
  end if;

  update public.saved_meals
    set name = p_name, meal = p_meal, updated_at = now()
    where id = p_id;

  delete from public.saved_meal_items where saved_meal_id = p_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.saved_meal_items(
      saved_meal_id, food_id, name, calories, proteins, carbs, fats,
      base_calories, base_proteins, base_carbs, base_fats,
      serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit, sort_order)
    values (
      p_id,
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
end;
$function$;

create or replace function public.duplicate_saved_meal(p_id uuid)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_new_id uuid;
  v_name text;
  v_meal text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select name, meal into v_name, v_meal
    from public.saved_meals where id = p_id and user_id = auth.uid();
  if v_name is null then raise exception 'not_found'; end if;

  insert into public.saved_meals(user_id, name, meal)
    values (auth.uid(), v_name || ' (copie)', v_meal)
    returning id into v_new_id;

  insert into public.saved_meal_items(
    saved_meal_id, food_id, name, calories, proteins, carbs, fats,
    base_calories, base_proteins, base_carbs, base_fats,
    serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit, sort_order)
  select
    v_new_id, food_id, name, calories, proteins, carbs, fats,
    base_calories, base_proteins, base_carbs, base_fats,
    serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit, sort_order
  from public.saved_meal_items
  where saved_meal_id = p_id;

  return v_new_id;
end;
$function$;
