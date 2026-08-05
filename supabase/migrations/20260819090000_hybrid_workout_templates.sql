-- Musculation hybride — Templates hybrides (2026-08-19)
--
-- Un modèle ("workout_templates") ne pouvait jusqu'ici décrire que des
-- exercices de force (workout_template_exercises : nom/séries/reps/charge).
-- Cette migration est additive et rétrocompatible : elle n'ajoute qu'une
-- colonne nullable et une nouvelle table, aucune ligne existante n'est
-- modifiée, aucun template force-only n'est affecté.
--
-- 1) `workout_template_exercises.exercise_reference_id` (nullable) :
--    identité Exercise-Central pour les exercices de modèle, jusqu'ici
--    absente de cette table (résolue par nom seul). Résolue au moment de
--    la création/mise à jour du modèle (useWorkoutTemplates.ts), jamais
--    bloquante (même pattern que tout autre chemin d'écriture).
--
-- 2) `workout_template_segments` : pendant "bloc métrique" (course/HYROX/
--    cardio) de `workout_template_exercises`, même esprit que
--    `workout_segments` (séance active) — label, discipline, metrics jsonb,
--    identité Exercise-Central. `position` partage le MÊME espace de
--    valeurs que `workout_template_exercises.position` (pas de contrainte
--    d'unicité entre les deux tables) : l'ordre RÉEL d'un modèle hybride se
--    reconstruit en fusionnant les deux listes triées par `position`,
--    exactement comme l'exemple demandé (Bench Press, Course 1000m, Sled
--    Push, Pull-ups, Row 1000m). Un template sans aucune ligne dans cette
--    table est un template force-only classique, strictement inchangé.

alter table public.workout_template_exercises
  add column if not exists exercise_reference_id uuid references public.exercise_reference(id) on delete set null;

create table if not exists public.workout_template_segments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null default 0,
  label text not null,
  discipline text references public.disciplines(id),
  metric_key text,
  metrics jsonb not null default '{}'::jsonb,
  exercise_reference_id uuid references public.exercise_reference(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.workout_template_segments enable row level security;

DROP POLICY IF EXISTS "workout_template_segments_select_own" ON public.workout_template_segments;
create policy "workout_template_segments_select_own"
  on public.workout_template_segments for select
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "workout_template_segments_insert_own" ON public.workout_template_segments;
create policy "workout_template_segments_insert_own"
  on public.workout_template_segments for insert
  with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "workout_template_segments_update_own" ON public.workout_template_segments;
create policy "workout_template_segments_update_own"
  on public.workout_template_segments for update
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "workout_template_segments_delete_own" ON public.workout_template_segments;
create policy "workout_template_segments_delete_own"
  on public.workout_template_segments for delete
  using (auth.uid() = user_id);

create index if not exists workout_template_segments_template_id_idx
  on public.workout_template_segments (template_id);
