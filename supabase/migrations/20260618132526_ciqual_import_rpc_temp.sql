create or replace function public.import_ciqual(payload jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into public.foods (
    name,normalized_name,category,subcategory,serving_type,source,source_id,verified,
    calories,water_g,protein_g,carbs_g,sugars_g,fiber_g,fat_g,saturated_fat_g,
    sodium_mg,magnesium_mg,phosphorus_mg,potassium_mg,calcium_mg,manganese_mg,iron_mg,copper_mg,zinc_mg,selenium_ug,
    vitamin_a_ug,vitamin_d_ug,vitamin_e_mg,vitamin_k_ug,vitamin_c_mg,
    vitamin_b1_mg,vitamin_b2_mg,vitamin_b3_mg,vitamin_b5_mg,vitamin_b6_mg,vitamin_b12_ug,vitamin_b9_ug)
  select name,normalized_name,category,subcategory,serving_type,source,source_id,coalesce(verified,true),
    calories,water_g,protein_g,carbs_g,sugars_g,fiber_g,fat_g,saturated_fat_g,
    sodium_mg,magnesium_mg,phosphorus_mg,potassium_mg,calcium_mg,manganese_mg,iron_mg,copper_mg,zinc_mg,selenium_ug,
    vitamin_a_ug,vitamin_d_ug,vitamin_e_mg,vitamin_k_ug,vitamin_c_mg,
    vitamin_b1_mg,vitamin_b2_mg,vitamin_b3_mg,vitamin_b5_mg,vitamin_b6_mg,vitamin_b12_ug,vitamin_b9_ug
  from jsonb_to_recordset(payload) as x(
    name text, normalized_name text, category text, subcategory text, serving_type text, source text, source_id text, verified boolean,
    calories numeric, water_g numeric, protein_g numeric, carbs_g numeric, sugars_g numeric, fiber_g numeric, fat_g numeric, saturated_fat_g numeric,
    sodium_mg numeric, magnesium_mg numeric, phosphorus_mg numeric, potassium_mg numeric, calcium_mg numeric, manganese_mg numeric, iron_mg numeric, copper_mg numeric, zinc_mg numeric, selenium_ug numeric,
    vitamin_a_ug numeric, vitamin_d_ug numeric, vitamin_e_mg numeric, vitamin_k_ug numeric, vitamin_c_mg numeric,
    vitamin_b1_mg numeric, vitamin_b2_mg numeric, vitamin_b3_mg numeric, vitamin_b5_mg numeric, vitamin_b6_mg numeric, vitamin_b12_ug numeric, vitamin_b9_ug numeric)
  on conflict (source, source_id) do update set
    name=excluded.name, normalized_name=excluded.normalized_name, category=excluded.category, subcategory=excluded.subcategory,
    serving_type=excluded.serving_type, verified=excluded.verified,
    calories=excluded.calories, water_g=excluded.water_g, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g,
    sugars_g=excluded.sugars_g, fiber_g=excluded.fiber_g, fat_g=excluded.fat_g, saturated_fat_g=excluded.saturated_fat_g,
    sodium_mg=excluded.sodium_mg, magnesium_mg=excluded.magnesium_mg, phosphorus_mg=excluded.phosphorus_mg, potassium_mg=excluded.potassium_mg,
    calcium_mg=excluded.calcium_mg, manganese_mg=excluded.manganese_mg, iron_mg=excluded.iron_mg, copper_mg=excluded.copper_mg,
    zinc_mg=excluded.zinc_mg, selenium_ug=excluded.selenium_ug, vitamin_a_ug=excluded.vitamin_a_ug, vitamin_d_ug=excluded.vitamin_d_ug,
    vitamin_e_mg=excluded.vitamin_e_mg, vitamin_k_ug=excluded.vitamin_k_ug, vitamin_c_mg=excluded.vitamin_c_mg,
    vitamin_b1_mg=excluded.vitamin_b1_mg, vitamin_b2_mg=excluded.vitamin_b2_mg, vitamin_b3_mg=excluded.vitamin_b3_mg,
    vitamin_b5_mg=excluded.vitamin_b5_mg, vitamin_b6_mg=excluded.vitamin_b6_mg, vitamin_b12_ug=excluded.vitamin_b12_ug, vitamin_b9_ug=excluded.vitamin_b9_ug;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.import_ciqual(jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
