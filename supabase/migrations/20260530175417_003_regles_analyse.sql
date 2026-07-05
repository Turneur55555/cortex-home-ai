-- C2 : règles d'analyse configurables par catégorie de salarié
create table if not exists public.regles_analyse (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  categorie text not null,
  regles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- une seule config par catégorie (modèle cabinet partagé, cf. 001/002)
create unique index if not exists regles_analyse_categorie_key
  on public.regles_analyse (categorie);

create index if not exists regles_analyse_regles_gin
  on public.regles_analyse using gin (regles);

alter table public.regles_analyse enable row level security;

drop policy if exists "regles_analyse_authenticated_all" on public.regles_analyse;
create policy "regles_analyse_authenticated_all"
  on public.regles_analyse
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- maj auto de updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists regles_analyse_set_updated_at on public.regles_analyse;
create trigger regles_analyse_set_updated_at
  before update on public.regles_analyse
  for each row execute function public.set_updated_at();
