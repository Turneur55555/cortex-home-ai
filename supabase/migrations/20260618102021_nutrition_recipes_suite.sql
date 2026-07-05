-- RECETTES : extension table existante + calcul nutritionnel auto
alter table public.recipes
  add column if not exists is_public boolean not null default false,
  add column if not exists source text not null default 'user',
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists total_weight_g numeric,
  add column if not exists calories numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists sugars_g numeric,
  add column if not exists fiber_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists saturated_fat_g numeric;
alter table public.recipes alter column user_id drop not null;

alter table public.recipe_ingredients
  add column if not exists food_id uuid references public.foods(id) on delete set null;
alter table public.recipe_ingredients alter column user_id drop not null;

-- Recalcul nutritionnel d'une recette à partir de ses ingrédients (foods)
create or replace function public.recompute_recipe_nutrition(p_recipe uuid)
returns void language sql security definer set search_path=public as $$
  update public.recipes r set
    total_weight_g = agg.tw, calories=agg.kcal, protein_g=agg.p, carbs_g=agg.c,
    sugars_g=agg.su, fiber_g=agg.fi, fat_g=agg.fat, saturated_fat_g=agg.sat, updated_at=now()
  from (
    select ri.recipe_id,
      sum(ri.grams) tw,
      sum(f.calories*ri.grams/100.0) kcal, sum(f.protein_g*ri.grams/100.0) p,
      sum(f.carbs_g*ri.grams/100.0) c, sum(f.sugars_g*ri.grams/100.0) su,
      sum(f.fiber_g*ri.grams/100.0) fi, sum(f.fat_g*ri.grams/100.0) fat,
      sum(f.saturated_fat_g*ri.grams/100.0) sat
    from public.recipe_ingredients ri
    join public.foods f on f.id = ri.food_id
    where ri.recipe_id = p_recipe and ri.grams is not null
    group by ri.recipe_id
  ) agg
  where r.id = agg.recipe_id;
$$;

create or replace function public.trg_recipe_ing_recompute()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.recompute_recipe_nutrition(coalesce(new.recipe_id, old.recipe_id));
  return null;
end $$;
drop trigger if exists recipe_ing_recompute on public.recipe_ingredients;
create trigger recipe_ing_recompute
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.trg_recipe_ing_recompute();

-- Tables liées
create table if not exists public.recipe_categories(
  id uuid primary key default gen_random_uuid(),
  name text not null unique, emoji text, sort_order smallint not null default 0
);
alter table public.recipe_categories enable row level security;
drop policy if exists recipe_categories_read on public.recipe_categories;
create policy recipe_categories_read on public.recipe_categories for select to authenticated using (true);

create table if not exists public.favorite_recipes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(), unique(user_id, recipe_id)
);
alter table public.favorite_recipes enable row level security;
drop policy if exists favorite_recipes_own on public.favorite_recipes;
create policy favorite_recipes_own on public.favorite_recipes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.recipe_history(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  used_at timestamptz not null default now()
);
alter table public.recipe_history enable row level security;
drop policy if exists recipe_history_own on public.recipe_history;
create policy recipe_history_own on public.recipe_history for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.meal_templates(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, meal text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.meal_templates enable row level security;
drop policy if exists meal_templates_own on public.meal_templates;
create policy meal_templates_own on public.meal_templates for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.meal_template_items(
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_name text, grams numeric, servings numeric default 1, sort_order smallint not null default 0
);
alter table public.meal_template_items enable row level security;
drop policy if exists meal_template_items_own on public.meal_template_items;
create policy meal_template_items_own on public.meal_template_items for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- RLS recettes : ses recettes + bibliothèque publique
drop policy if exists recipes_select_own_or_public on public.recipes;
create policy recipes_select_own_or_public on public.recipes for select to authenticated using (user_id = auth.uid() or is_public);
drop policy if exists recipes_modify_own on public.recipes;
create policy recipes_modify_own on public.recipes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

insert into public.recipe_categories(name, emoji, sort_order) values
  ('Petit-déjeuner','🍳',1),('Déjeuner','🍽️',2),('Dîner','🌙',3),('Collation','🥨',4),
  ('Prise de masse','💪',5),('Sèche','🔥',6),('Végétarien','🥗',7),('Smoothie','🥤',8)
on conflict (name) do nothing;

notify pgrst, 'reload schema';
