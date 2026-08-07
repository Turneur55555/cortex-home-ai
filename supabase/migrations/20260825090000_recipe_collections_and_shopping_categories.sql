-- Module "Recettes" — gestionnaire complet : collections + liste de courses
-- catégorisée. Migration STRICTEMENT ADDITIVE.
--
-- Collections : une recette peut appartenir à plusieurs collections
-- (many-to-many via recipe_collection_recipes). "Favoris" reste virtuel,
-- dérivé de recipes.is_favorite (déjà existant) — jamais une ligne ici, pour
-- ne pas dupliquer une source de vérité déjà câblée.
--
-- Catégorie ingrédient : ajoutée sur recipe_ingredients (renseignée par l'IA
-- à l'analyse, voir recipe-parser.ts RECIPE_TOOL) et sur shopping_list
-- (recopiée à la génération de la liste) pour permettre le regroupement par
-- rayon dans l'UI. Liste fermée alignée sur la demande produit.

create table if not exists public.recipe_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.recipe_collection_recipes (
  collection_id uuid not null references public.recipe_collections(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);

create index if not exists idx_recipe_collections_user on public.recipe_collections(user_id);
create index if not exists idx_recipe_collection_recipes_recipe on public.recipe_collection_recipes(recipe_id);
create index if not exists idx_recipe_collection_recipes_user on public.recipe_collection_recipes(user_id);

alter table public.recipe_collections enable row level security;
alter table public.recipe_collection_recipes enable row level security;

drop policy if exists "Users manage own recipe collections" on public.recipe_collections;
create policy "Users manage own recipe collections" on public.recipe_collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own recipe collection memberships" on public.recipe_collection_recipes;
create policy "Users manage own recipe collection memberships" on public.recipe_collection_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Catégorie ingrédient (regroupement liste de courses) ─────────────────────

alter table public.recipe_ingredients
  add column if not exists category text
    check (category is null or category in (
      'Fruits et légumes', 'Viandes', 'Poissons', 'Produits laitiers',
      'Épicerie', 'Surgelés', 'Boissons', 'Divers'
    ));

alter table public.shopping_list
  add column if not exists category text
    check (category is null or category in (
      'Fruits et légumes', 'Viandes', 'Poissons', 'Produits laitiers',
      'Épicerie', 'Surgelés', 'Boissons', 'Divers'
    ));
