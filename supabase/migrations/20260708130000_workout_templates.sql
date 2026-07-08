-- ============================================================
-- Modèles de séance ("Utiliser une séance sauvegardée") — module Nouvelle
-- séance / Choisir une épreuve. Sans lien avec Sensei (moteur d'IA) : un
-- modèle est uniquement une structure de séance réutilisable pour démarrer
-- rapidement (exercices, ordre, supersets, notes, paramètres par défaut).
-- Distinct de "Refaire en live" (hooks/use-fitness.ts useStartWorkoutFromTemplate,
-- qui rejoue une séance PASSÉE par son id) : ici l'utilisateur nomme et
-- réutilise un modèle indépendant de tout historique.
-- ============================================================

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default 'Dumbbell',
  color text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_templates_user_id on public.workout_templates (user_id);

alter table public.workout_templates enable row level security;

drop policy if exists "Users manage own workout templates" on public.workout_templates;
create policy "Users manage own workout templates"
  on public.workout_templates
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Exercices d'un modèle : ordre explicite (position) car exercises.* n'a
-- aucune colonne d'ordre et son insertion ne le garantit pas côté lecture
-- (comportement existant, non modifié ici) — un modèle doit rester fidèle
-- à l'ordre choisi par l'utilisateur indépendamment de cette limite.
create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position smallint not null default 0,
  -- Exercices partageant un même superset_group non-nul forment un superset.
  superset_group smallint,
  default_sets smallint,
  default_reps smallint,
  default_weight numeric(6, 2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_template_exercises_template_id
  on public.workout_template_exercises (template_id);
create index if not exists idx_workout_template_exercises_user_id
  on public.workout_template_exercises (user_id);

alter table public.workout_template_exercises enable row level security;

drop policy if exists "Users manage own workout template exercises" on public.workout_template_exercises;
create policy "Users manage own workout template exercises"
  on public.workout_template_exercises
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Additive uniquement : NULL pour toute séance existante, aucune séance
-- démarrée hors modèle ne renseigne cette colonne (comportement inchangé).
alter table public.exercises add column if not exists superset_group smallint;

notify pgrst, 'reload schema';
