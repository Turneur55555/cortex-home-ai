-- Coach IA V2 : programmes multi-semaines + périodisation
-- Migration STRICTEMENT ADDITIVE (DB partagée avec app paie) : 4 tables nouvelles, RLS par user.

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  goal text not null default 'hypertrophy',            -- strength | hypertrophy | endurance | peaking
  periodization_model text not null default 'linear',  -- linear | undulating | block
  total_weeks smallint not null default 4 check (total_weeks between 1 and 52),
  days_per_week smallint check (days_per_week between 1 and 7),
  start_date date,
  status text not null default 'draft',                -- draft | active | completed | archived
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  user_id uuid not null,
  week_number smallint not null check (week_number >= 1),
  phase text not null default 'accumulation',          -- accumulation | intensification | peak | deload
  intensity_pct numeric check (intensity_pct >= 0 and intensity_pct <= 110),  -- % 1RM cible
  target_rpe numeric check (target_rpe >= 0 and target_rpe <= 10),
  volume_multiplier numeric not null default 1 check (volume_multiplier >= 0),
  is_deload boolean not null default false,
  created_at timestamptz not null default now(),
  unique (program_id, week_number)
);

create table if not exists public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  day_of_week smallint check (day_of_week between 1 and 7),  -- 1 = lundi
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.program_sessions(id) on delete cascade,
  user_id uuid not null,
  exercise_name text not null,
  muscle_slug text,                                    -- MuscleId (donnée, pour la reco via récupération)
  sort_order smallint not null default 0,
  target_sets smallint check (target_sets >= 0),
  rep_min smallint check (rep_min >= 0),
  rep_max smallint check (rep_max >= 0),
  target_rpe numeric check (target_rpe >= 0 and target_rpe <= 10),
  target_weight numeric check (target_weight >= 0),    -- charge recommandée (nullable, calculée)
  rest_seconds smallint check (rest_seconds >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_programs_user on public.training_programs(user_id);
create index if not exists idx_program_weeks_program on public.program_weeks(program_id);
create index if not exists idx_program_weeks_user on public.program_weeks(user_id);
create index if not exists idx_program_sessions_week on public.program_sessions(week_id);
create index if not exists idx_program_sessions_user on public.program_sessions(user_id);
create index if not exists idx_program_exercises_session on public.program_exercises(session_id);
create index if not exists idx_program_exercises_user on public.program_exercises(user_id);

alter table public.training_programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.program_sessions enable row level security;
alter table public.program_exercises enable row level security;

DROP POLICY IF EXISTS "Users manage own training programs" ON public.training_programs;
create policy "Users manage own training programs" on public.training_programs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users manage own program weeks" ON public.program_weeks;
create policy "Users manage own program weeks" on public.program_weeks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users manage own program sessions" ON public.program_sessions;
create policy "Users manage own program sessions" on public.program_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users manage own program exercises" ON public.program_exercises;
create policy "Users manage own program exercises" on public.program_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
