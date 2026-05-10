
-- ============================================
-- USERS PROFILES
-- ============================================
create table public.users_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  premium boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.users_profiles enable row level security;

create policy "Users select own profile" on public.users_profiles
  for select using (auth.uid() = id);
create policy "Users insert own profile" on public.users_profiles
  for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.users_profiles
  for update using (auth.uid() = id);

-- Auto-création profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users_profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- ITEMS
-- ============================================
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  category text not null check (char_length(category) <= 100),
  module text not null check (module in ('alimentation','habits','pharmacie','menager')),
  location text check (char_length(location) <= 100),
  quantity int not null default 1 check (quantity >= 0 and quantity <= 9999),
  unit text check (char_length(unit) <= 50),
  expiration_date timestamptz,
  confidence_score float check (confidence_score >= 0 and confidence_score <= 1),
  flagged boolean not null default false,
  storage_path text,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;
create policy "Users manage own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- BODY TRACKING
-- ============================================
create table public.body_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null check (date <= current_date),
  weight float check (weight >= 20 and weight <= 500),
  body_fat float check (body_fat >= 1 and body_fat <= 70),
  muscle_mass float check (muscle_mass >= 1 and muscle_mass <= 100),
  chest float check (chest >= 30 and chest <= 250),
  waist float check (waist >= 30 and waist <= 250),
  hips float check (hips >= 30 and hips <= 250),
  left_arm float check (left_arm >= 10 and left_arm <= 100),
  right_arm float check (right_arm >= 10 and right_arm <= 100),
  left_thigh float check (left_thigh >= 20 and left_thigh <= 150),
  right_thigh float check (right_thigh >= 20 and right_thigh <= 150),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.body_tracking enable row level security;
create policy "Users manage own body" on public.body_tracking
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- WORKOUTS
-- ============================================
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null check (char_length(name) <= 200),
  duration_minutes int check (duration_minutes >= 1 and duration_minutes <= 600),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.workouts enable row level security;
create policy "Users manage own workouts" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- EXERCISES
-- ============================================
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  sets int check (sets >= 1 and sets <= 100),
  reps int check (reps >= 1 and reps <= 10000),
  weight float check (weight >= 0 and weight <= 1000),
  notes text check (char_length(notes) <= 500)
);

alter table public.exercises enable row level security;
create policy "Users manage own exercises" on public.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- NUTRITION
-- ============================================
create table public.nutrition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal text check (meal in ('petit-dejeuner','dejeuner','diner','collation')),
  name text not null check (char_length(name) <= 200),
  calories int check (calories >= 0 and calories <= 10000),
  proteins float check (proteins >= 0 and proteins <= 1000),
  carbs float check (carbs >= 0 and carbs <= 1000),
  fats float check (fats >= 0 and fats <= 1000),
  created_at timestamptz not null default now()
);

alter table public.nutrition enable row level security;
create policy "Users manage own nutrition" on public.nutrition
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- DOCUMENTS
-- ============================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  storage_path text not null,
  module text not null check (module in ('alimentation','habits','pharmacie','menager','musculation','general')),
  summary text,
  analysis text,
  key_insights jsonb,
  alerts jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "Users manage own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- RATE LIMITS
-- ============================================
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('scan_image','analyze_pdf')),
  window_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
create policy "Users see own rate limits" on public.rate_limits
  for select using (auth.uid() = user_id);
create policy "Users insert own rate limits" on public.rate_limits
  for insert with check (auth.uid() = user_id);

-- ============================================
-- INDEX
-- ============================================
create index idx_items_user_module on public.items(user_id, module);
create index idx_items_expiration on public.items(expiration_date) where expiration_date is not null;
create index idx_items_flagged on public.items(user_id, flagged) where flagged = true;
create index idx_body_tracking_user_date on public.body_tracking(user_id, date desc);
create index idx_workouts_user_date on public.workouts(user_id, date desc);
create index idx_exercises_workout on public.exercises(workout_id);
create index idx_nutrition_user_date on public.nutrition(user_id, date desc);
create index idx_documents_user on public.documents(user_id);
create index idx_rate_limits_user_action on public.rate_limits(user_id, action, window_start);

-- ============================================
-- TRIGGERS FREE PLAN
-- ============================================
create or replace function public.enforce_free_plan_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_premium boolean;
  current_count int;
begin
  select premium into is_premium from public.users_profiles where id = NEW.user_id;
  if coalesce(is_premium, false) then return NEW; end if;
  select count(*) into current_count from public.items
    where user_id = NEW.user_id and module = NEW.module;
  if current_count >= 50 then
    raise exception 'FREE_PLAN_LIMIT: Limite de 50 items atteinte pour ce module.';
  end if;
  return NEW;
end;
$$;

create trigger check_free_plan_items
  before insert on public.items
  for each row execute function public.enforce_free_plan_items();

create or replace function public.enforce_free_plan_documents()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_premium boolean;
  current_count int;
begin
  select premium into is_premium from public.users_profiles where id = NEW.user_id;
  if coalesce(is_premium, false) then return NEW; end if;
  select count(*) into current_count from public.documents where user_id = NEW.user_id;
  if current_count >= 10 then
    raise exception 'FREE_PLAN_LIMIT: Limite de 10 documents PDF atteinte.';
  end if;
  return NEW;
end;
$$;

create trigger check_free_plan_documents
  before insert on public.documents
  for each row execute function public.enforce_free_plan_documents();

-- ============================================
-- STORAGE BUCKETS (privés)
-- ============================================
insert into storage.buckets (id, name, public) values
  ('food-images','food-images',false),
  ('clothes-images','clothes-images',false),
  ('pharmacy-images','pharmacy-images',false),
  ('pdf-documents','pdf-documents',false)
on conflict (id) do nothing;

create policy "Users read own files" on storage.objects
  for select using (
    bucket_id in ('food-images','clothes-images','pharmacy-images','pdf-documents')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users upload own files" on storage.objects
  for insert with check (
    bucket_id in ('food-images','clothes-images','pharmacy-images','pdf-documents')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own files" on storage.objects
  for update using (
    bucket_id in ('food-images','clothes-images','pharmacy-images','pdf-documents')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own files" on storage.objects
  for delete using (
    bucket_id in ('food-images','clothes-images','pharmacy-images','pdf-documents')
    and auth.uid()::text = (storage.foldername(name))[1]
  );
