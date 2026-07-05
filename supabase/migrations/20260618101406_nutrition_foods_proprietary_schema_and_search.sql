-- Extensions recherche
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- unaccent immuable (forme à 2 args = stable/immutable safe)
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe
set search_path = public, extensions, pg_catalog
as $$ select unaccent('unaccent', $1) $$;

-- 1) Renommage vers le schéma propriétaire (idempotent)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='name_normalized') then
    alter table public.foods rename column name_normalized to normalized_name; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='proteins') then
    alter table public.foods rename column proteins to protein_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='carbs') then
    alter table public.foods rename column carbs to carbs_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='fats') then
    alter table public.foods rename column fats to fat_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='fiber') then
    alter table public.foods rename column fiber to fiber_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='sugar') then
    alter table public.foods rename column sugar to sugars_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='saturated_fat') then
    alter table public.foods rename column saturated_fat to saturated_fat_g; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='foods' and column_name='sodium') then
    alter table public.foods rename column sodium to sodium_mg; end if;
end $$;

-- 2) Ajout des colonnes du schéma propriétaire
alter table public.foods
  add column if not exists subcategory      text,
  add column if not exists barcode          text,
  add column if not exists serving_type     text,
  add column if not exists vitamin_a_ug     numeric,
  add column if not exists vitamin_c_mg     numeric,
  add column if not exists vitamin_d_ug     numeric,
  add column if not exists vitamin_e_mg     numeric,
  add column if not exists vitamin_k_ug     numeric,
  add column if not exists vitamin_b1_mg    numeric,
  add column if not exists vitamin_b2_mg    numeric,
  add column if not exists vitamin_b3_mg    numeric,
  add column if not exists vitamin_b5_mg    numeric,
  add column if not exists vitamin_b6_mg    numeric,
  add column if not exists vitamin_b9_ug    numeric,
  add column if not exists vitamin_b12_ug   numeric,
  add column if not exists calcium_mg       numeric,
  add column if not exists magnesium_mg     numeric,
  add column if not exists phosphorus_mg    numeric,
  add column if not exists potassium_mg     numeric,
  add column if not exists iron_mg          numeric,
  add column if not exists zinc_mg          numeric,
  add column if not exists copper_mg        numeric,
  add column if not exists manganese_mg     numeric,
  add column if not exists selenium_ug      numeric,
  add column if not exists water_g          numeric,
  add column if not exists verified         boolean not null default false;

-- 3) Migration des micros jsonb existants vers les colonnes
update public.foods set
  iron_mg        = coalesce(iron_mg,        nullif(micros->>'iron','')::numeric),
  calcium_mg     = coalesce(calcium_mg,     nullif(micros->>'calcium','')::numeric),
  magnesium_mg   = coalesce(magnesium_mg,   nullif(micros->>'magnesium','')::numeric),
  zinc_mg        = coalesce(zinc_mg,        nullif(micros->>'zinc','')::numeric),
  potassium_mg   = coalesce(potassium_mg,   nullif(micros->>'potassium','')::numeric),
  sodium_mg      = coalesce(sodium_mg,      nullif(micros->>'sodium','')::numeric),
  vitamin_c_mg   = coalesce(vitamin_c_mg,   nullif(micros->>'vitamin_c','')::numeric),
  vitamin_d_ug   = coalesce(vitamin_d_ug,   nullif(micros->>'vitamin_d','')::numeric),
  vitamin_b12_ug = coalesce(vitamin_b12_ug, nullif(micros->>'vitamin_b12','')::numeric),
  vitamin_b9_ug  = coalesce(vitamin_b9_ug,  nullif(micros->>'folate','')::numeric),
  vitamin_a_ug   = coalesce(vitamin_a_ug,   nullif(micros->>'vitamin_a','')::numeric),
  vitamin_b6_mg  = coalesce(vitamin_b6_mg,  nullif(micros->>'vitamin_b6','')::numeric),
  vitamin_e_mg   = coalesce(vitamin_e_mg,   nullif(micros->>'vitamin_e','')::numeric)
where micros is not null and micros <> '{}'::jsonb;

-- 4) Colonne FTS générée (français + unaccent)
alter table public.foods drop column if exists search_tsv;
alter table public.foods add column search_tsv tsvector
  generated always as (
    to_tsvector('french',
      public.f_unaccent(
        coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' ||
        coalesce(category,'') || ' ' || coalesce(subcategory,'')
      )
    )
  ) stored;

-- 5) Index recherche (<100ms)
create index if not exists idx_foods_tsv            on public.foods using gin (search_tsv);
create index if not exists idx_foods_normname_trgm  on public.foods using gin (normalized_name gin_trgm_ops);
create index if not exists idx_foods_normname_prefix on public.foods (normalized_name text_pattern_ops);
create index if not exists idx_foods_dmetaphone      on public.foods (dmetaphone(normalized_name));
create index if not exists idx_foods_barcode         on public.foods (barcode) where barcode is not null;
create index if not exists idx_foods_category        on public.foods (category);

-- 6) RPC recherche rapide (exact > préfixe > trigram > FTS > phonétique)
create or replace function public.search_foods(q text, max_results int default 30)
returns setof public.foods language sql stable parallel safe
set search_path = public, extensions, pg_catalog
as $$
  with nq as (select public.f_unaccent(lower(btrim(coalesce(q,'')))) as nn)
  select f.*
  from public.foods f, nq
  where nq.nn <> '' and (
        f.normalized_name % nq.nn
     or f.normalized_name like nq.nn || '%'
     or f.search_tsv @@ plainto_tsquery('french', q)
     or dmetaphone(f.normalized_name) = dmetaphone(nq.nn)
  )
  order by
    (f.normalized_name = nq.nn) desc,
    (f.normalized_name like nq.nn || '%') desc,
    similarity(f.normalized_name, nq.nn) desc,
    f.verified desc,
    f.name asc
  limit greatest(1, least(coalesce(max_results,30), 100));
$$;

-- 7) RPC recherche avancée (filtres catégorie + macros mini)
create or replace function public.search_foods_advanced(
  q text default null,
  p_category text default null,
  min_protein numeric default null,
  max_calories numeric default null,
  p_verified boolean default null,
  max_results int default 50
)
returns setof public.foods language sql stable parallel safe
set search_path = public, extensions, pg_catalog
as $$
  with nq as (select public.f_unaccent(lower(btrim(coalesce(q,'')))) as nn)
  select f.*
  from public.foods f, nq
  where (nq.nn = '' or
         f.normalized_name % nq.nn
      or f.normalized_name like nq.nn || '%'
      or f.search_tsv @@ plainto_tsquery('french', q)
      or dmetaphone(f.normalized_name) = dmetaphone(nq.nn))
    and (p_category   is null or f.category = p_category)
    and (min_protein  is null or f.protein_g >= min_protein)
    and (max_calories is null or f.calories  <= max_calories)
    and (p_verified   is null or f.verified  = p_verified)
  order by
    case when nq.nn = '' then 0 else (f.normalized_name = nq.nn)::int end desc,
    similarity(f.normalized_name, nq.nn) desc,
    f.verified desc,
    f.name asc
  limit greatest(1, least(coalesce(max_results,50), 200));
$$;

grant execute on function public.search_foods(text,int) to anon, authenticated, service_role;
grant execute on function public.search_foods_advanced(text,text,numeric,numeric,boolean,int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
