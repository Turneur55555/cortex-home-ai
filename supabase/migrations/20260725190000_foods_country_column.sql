-- Ajoute une colonne `country` (ISO 3166-1 alpha-2, ex. 'FR') sur `foods`,
-- pour piloter la priorité de sources par pays côté edge function
-- (food-lookup) — nullable et additive : aucune ligne existante n'est
-- modifiée, aucune clé étrangère touchée, aucune donnée supprimée.
alter table public.foods add column if not exists country text;

comment on column public.foods.country is
  'ISO 3166-1 alpha-2 (ex: FR) — pays d''origine de la fiche quand connu '
  '(déduit des countries_tags OpenFoodFacts). NULL = pays inconnu '
  '(USDA, CIQUAL, aliments perso, anciennes fiches jamais retaguées).';

create index if not exists idx_foods_country on public.foods (country);

notify pgrst, 'reload schema';
