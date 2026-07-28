-- Produit introuvable au scan : permettre à l'utilisateur de créer lui-même
-- l'aliment (catalogue `foods`, source='custom') et de l'associer à son
-- code-barres (`food_barcodes`), pour que tous ses futurs scans le retrouvent.

-- food_barcodes : jusqu'ici lecture seule pour les utilisateurs (écriture
-- réservée au service role via l'edge function food-lookup). On ajoute une
-- policy d'insertion strictement bornée à un aliment que l'utilisateur vient
-- de créer lui-même (foods.user_id = auth.uid()) — jamais de barcode
-- réassignable à un aliment appartenant à quelqu'un d'autre.
drop policy if exists food_barcodes_insert_own_food on public.food_barcodes;
create policy food_barcodes_insert_own_food on public.food_barcodes
  for insert to authenticated
  with check (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()));

-- food_servings : même principe, pour la portion par défaut optionnelle
-- (quantité/unité du produit saisie à la création).
drop policy if exists food_servings_insert_own_food on public.food_servings;
create policy food_servings_insert_own_food on public.food_servings
  for insert to authenticated
  with check (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()));

-- Création atomique : aliment personnalisé + code-barres + portion par défaut
-- optionnelle. SECURITY INVOKER : s'appuie entièrement sur les policies RLS
-- ci-dessus et sur foods_insert_own (déjà en place), aucun contournement de RLS.
create or replace function public.create_custom_food_with_barcode(
  p_barcode text,
  p_name text,
  p_brand text default null,
  p_category text default null,
  p_calories numeric default null,
  p_protein_g numeric default null,
  p_carbs_g numeric default null,
  p_fat_g numeric default null,
  p_serving_grams numeric default null,
  p_serving_unit text default null
)
returns public.foods
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $func$
declare
  v_food public.foods;
  v_barcode text := btrim(coalesce(p_barcode, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_normalized text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if v_barcode = '' then raise exception 'barcode_required'; end if;
  if v_name = '' then raise exception 'name_required'; end if;
  if exists (select 1 from public.food_barcodes where barcode = v_barcode) then
    raise exception 'barcode_exists';
  end if;

  v_normalized := btrim(regexp_replace(public.f_unaccent(lower(v_name)), '[^a-z0-9]+', ' ', 'g'));

  insert into public.foods (
    source, name, normalized_name, brand, category, barcode,
    calories, protein_g, carbs_g, fat_g, user_id, verified
  ) values (
    'custom', v_name, v_normalized,
    nullif(btrim(coalesce(p_brand, '')), ''),
    nullif(btrim(coalesce(p_category, '')), ''),
    v_barcode, p_calories, p_protein_g, p_carbs_g, p_fat_g, auth.uid(), false
  ) returning * into v_food;

  insert into public.food_barcodes (barcode, food_id) values (v_barcode, v_food.id);

  if p_serving_grams is not null and p_serving_grams > 0 then
    insert into public.food_servings (food_id, label, unit, quantity, grams, is_default)
    values (
      v_food.id,
      coalesce(nullif(p_serving_unit, ''), 'g'),
      coalesce(nullif(p_serving_unit, ''), 'g'),
      p_serving_grams,
      p_serving_grams,
      true
    );
  end if;

  return v_food;
end;
$func$;

grant execute on function public.create_custom_food_with_barcode(
  text, text, text, text, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

notify pgrst, 'reload schema';
