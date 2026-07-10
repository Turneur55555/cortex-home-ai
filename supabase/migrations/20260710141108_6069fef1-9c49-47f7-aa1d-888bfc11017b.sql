create table if not exists public.workout_segments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null default 0,
  label text not null,
  metric_key text,
  metrics jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_segments TO authenticated;
GRANT ALL ON public.workout_segments TO service_role;

create index if not exists idx_workout_segments_workout_id
  on public.workout_segments (workout_id);
create index if not exists idx_workout_segments_user_id
  on public.workout_segments (user_id);
create index if not exists idx_workout_segments_user_label
  on public.workout_segments (user_id, label);

alter table public.workout_segments enable row level security;

drop policy if exists "Users manage own workout segments" on public.workout_segments;
create policy "Users manage own workout segments"
  on public.workout_segments
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.workout_segments is
  'Segments éditables (pendant générique de exercises/exercise_sets) pour les disciplines Sensei non-musculation.';

notify pgrst, 'reload schema';