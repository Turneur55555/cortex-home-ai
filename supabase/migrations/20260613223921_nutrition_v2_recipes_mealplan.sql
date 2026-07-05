-- Nutrition V2 : recettes (lien macros) + planning hebdo + liste de courses depuis stock
-- Migration STRICTEMENT ADDITIVE : 3 tables nouvelles. Réutilise items (macros) et shopping_list existants.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  servings numeric not null default 1 check (servings > 0),
  prep_minutes smallint check (prep_minutes >= 0),
  instructions text,
  image_path text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null,
  item_id uuid references public.items(id) on delete set null,  -- lien stock/macros (nullable)
  name text not null,                                            -- fallback si pas d'item
  quantity numeric check (quantity >= 0),                        -- quantité dans l'unité affichée
  unit text,                                                     -- g | ml | piece | ...
  grams numeric check (grams >= 0),                              -- masse normalisée pour calcul macros (per_100g)
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  meal text not null,                                  -- petit-dejeuner | dejeuner | diner | collation
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_name text,                                    -- repas libre sans recette
  servings numeric not null default 1 check (servings > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_recipes_user on public.recipes(user_id);
create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id);
create index if not exists idx_recipe_ingredients_user on public.recipe_ingredients(user_id);
create index if not exists idx_recipe_ingredients_item on public.recipe_ingredients(item_id);
create index if not exists idx_meal_plans_user_date on public.meal_plans(user_id, date);
create index if not exists idx_meal_plans_recipe on public.meal_plans(recipe_id);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;

DROP POLICY IF EXISTS "Users manage own recipes" ON public.recipes;
create policy "Users manage own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own recipe ingredients" on public.recipe_ingredients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own meal plans" on public.meal_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
