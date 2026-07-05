create or replace function public.search_foods(q text, max_results int default 30)
returns setof public.foods language sql stable parallel safe
set search_path = public, extensions, pg_catalog
as $$
  with nq as (select public.f_unaccent(lower(btrim(coalesce(q,'')))) as nn)
  select f.*
  from public.foods f, nq
  where nq.nn <> '' and (
        f.normalized_name % nq.nn
     or word_similarity(nq.nn, f.normalized_name) > 0.3
     or f.normalized_name like '%' || nq.nn || '%'
     or f.search_tsv @@ plainto_tsquery('french', q)
     or dmetaphone(f.normalized_name) = dmetaphone(nq.nn)
  )
  order by
    (f.normalized_name = nq.nn) desc,
    (f.normalized_name like nq.nn || '%') desc,
    word_similarity(nq.nn, f.normalized_name) desc,
    similarity(f.normalized_name, nq.nn) desc,
    f.verified desc,
    f.name asc
  limit greatest(1, least(coalesce(max_results,30), 100));
$$;

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
      or word_similarity(nq.nn, f.normalized_name) > 0.3
      or f.normalized_name like '%' || nq.nn || '%'
      or f.search_tsv @@ plainto_tsquery('french', q)
      or dmetaphone(f.normalized_name) = dmetaphone(nq.nn))
    and (p_category   is null or f.category = p_category)
    and (min_protein  is null or f.protein_g >= min_protein)
    and (max_calories is null or f.calories  <= max_calories)
    and (p_verified   is null or f.verified  = p_verified)
  order by
    case when nq.nn = '' then 0 else (f.normalized_name = nq.nn)::int end desc,
    word_similarity(nq.nn, f.normalized_name) desc,
    f.verified desc,
    f.name asc
  limit greatest(1, least(coalesce(max_results,50), 200));
$$;

grant execute on function public.search_foods(text,int) to anon, authenticated, service_role;
grant execute on function public.search_foods_advanced(text,text,numeric,numeric,boolean,int) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
