-- V2.1 import de recettes : cache GLOBAL partagé entre utilisateurs.
--
-- La V2 (20260821090000_recipe_import_v2.sql) dédoublonnait uniquement par
-- (user_id, source_url) : deux utilisateurs important le même Reel Instagram
-- déclenchaient chacun une analyse IA complète. Ce cache est une couche
-- AU-DESSUS, clé = (source_kind, source_url) SANS user_id : une publication
-- n'est analysée par l'IA qu'UNE SEULE FOIS, tous utilisateurs confondus.
--
-- `recipes`/`recipe_ingredients` restent inchangées et continuent de faire
-- foi pour les hooks existants (useRecipes, RecipeLogSheet, MealPlanSheet) :
-- chaque utilisateur garde SA PROPRE ligne `recipes` (RLS user_id =
-- auth.uid()). Sur un cache hit, l'edge function recipe-import copie le
-- contenu de ce cache vers une nouvelle ligne `recipes` pour l'utilisateur
-- courant — une opération DB pure, sans appel IA.
create table if not exists public.recipe_import_cache (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_url text not null,
  title text not null,
  servings integer not null default 1,
  confidence numeric,
  notes text,
  source_image_url text,
  per_serving_calories numeric not null default 0,
  per_serving_proteins numeric not null default 0,
  per_serving_carbs numeric not null default 0,
  per_serving_fats numeric not null default 0,
  per_serving_fiber numeric not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  analyzed_at timestamptz not null default now()
);

ALTER TABLE public.recipe_import_cache
  DROP CONSTRAINT IF EXISTS recipe_import_cache_confidence_check;
ALTER TABLE public.recipe_import_cache
  ADD CONSTRAINT recipe_import_cache_confidence_check
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

create unique index if not exists idx_recipe_import_cache_source
  on public.recipe_import_cache(source_kind, source_url);

alter table public.recipe_import_cache enable row level security;

-- Lecture partagée : ce sont des données de recette non-sensibles (titre,
-- ingrédients, macros), pas de user_id sur cette table — tout utilisateur
-- authentifié peut lire le cache pour éviter de refaire l'analyse IA.
DROP POLICY IF EXISTS "Authenticated users can read the shared recipe cache" ON public.recipe_import_cache;
create policy "Authenticated users can read the shared recipe cache"
  on public.recipe_import_cache for select
  to authenticated
  using (true);

-- Volontairement AUCUNE policy insert/update/delete : seule la clé
-- service_role (qui bypass RLS) écrit dans ce cache, depuis l'edge function
-- recipe-import — jamais un utilisateur final directement.

comment on table public.recipe_import_cache is
  'Cache global (tous utilisateurs) des recettes déjà analysées par IA depuis une source externe (Instagram aujourd''hui). Clé = (source_kind, source_url). Écrit uniquement via service_role par recipe-import — voir _shared/recipe-db.ts.';
