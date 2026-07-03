-- Rattrapage schéma : saved_meals / saved_meal_items / nutrition_favorites
-- Tables créées initialement en prod hors migrations (audit nutrition 2026-07-02).
-- Idempotent : no-op en prod, permet de reconstruire la base depuis le repo.

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

create table if not exists public.nutrition_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  meal text check (meal = any (array['petit-dej','petit-dejeuner','dejeuner','diner','collation'])),
  calories integer check (calories is null or (calories >= 0 and calories <= 10000)),
  proteins double precision check (proteins is null or (proteins >= 0 and proteins <= 1000)),
  carbs double precision check (carbs is null or (carbs >= 0 and carbs <= 1000)),
  fats double precision check (fats is null or (fats >= 0 and fats <= 1000)),
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_meal_items_food_id on public.saved_meal_items(food_id);

alter table public.saved_meals enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.nutrition_favorites enable row level security;

drop policy if exists saved_meals_select_own on public.saved_meals;
create policy saved_meals_select_own on public.saved_meals for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists saved_meals_insert_own on public.saved_meals;
create policy saved_meals_insert_own on public.saved_meals for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists saved_meals_update_own on public.saved_meals;
create policy saved_meals_update_own on public.saved_meals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists saved_meals_delete_own on public.saved_meals;
create policy saved_meals_delete_own on public.saved_meals for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists saved_meal_items_select_own on public.saved_meal_items;
create policy saved_meal_items_select_own on public.saved_meal_items for select to authenticated
  using (exists (select 1 from public.saved_meals m where m.id = saved_meal_items.saved_meal_id and m.user_id = (select auth.uid())));
drop policy if exists saved_meal_items_insert_own on public.saved_meal_items;
create policy saved_meal_items_insert_own on public.saved_meal_items for insert to authenticated
  with check (exists (select 1 from public.saved_meals m where m.id = saved_meal_items.saved_meal_id and m.user_id = (select auth.uid())));
drop policy if exists saved_meal_items_update_own on public.saved_meal_items;
create policy saved_meal_items_update_own on public.saved_meal_items for update to authenticated
  using (exists (select 1 from public.saved_meals m where m.id = saved_meal_items.saved_meal_id and m.user_id = (select auth.uid())));
drop policy if exists saved_meal_items_delete_own on public.saved_meal_items;
create policy saved_meal_items_delete_own on public.saved_meal_items for delete to authenticated
  using (exists (select 1 from public.saved_meals m where m.id = saved_meal_items.saved_meal_id and m.user_id = (select auth.uid())));

drop policy if exists fav_select_own on public.nutrition_favorites;
create policy fav_select_own on public.nutrition_favorites for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists fav_insert_own on public.nutrition_favorites;
create policy fav_insert_own on public.nutrition_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists fav_delete_own on public.nutrition_favorites;
create policy fav_delete_own on public.nutrition_favorites for delete to authenticated using ((select auth.uid()) = user_id);
