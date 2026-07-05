create table if not exists public.meal_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal text not null, name text,
  created_at timestamptz not null default now()
);
alter table public.meal_logs enable row level security;
drop policy if exists meal_logs_own on public.meal_logs;
create policy meal_logs_own on public.meal_logs for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.food_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal text not null default 'autre',
  meal_log_id uuid references public.meal_logs(id) on delete set null,
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_name text, grams numeric, servings numeric,
  calories numeric, protein_g numeric, carbs_g numeric, sugars_g numeric,
  fiber_g numeric, fat_g numeric, saturated_fat_g numeric, micros jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
alter table public.food_logs enable row level security;
drop policy if exists food_logs_own on public.food_logs;
create policy food_logs_own on public.food_logs for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create index if not exists idx_food_logs_user_date on public.food_logs(user_id, date);

create or replace function public.trg_food_log_fill()
returns trigger language plpgsql security definer set search_path=public as $$
declare f public.foods%rowtype; factor numeric;
begin
  if new.food_id is not null and new.grams is not null then
    select * into f from public.foods where id = new.food_id;
    if found then
      factor := new.grams/100.0;
      new.calories := coalesce(new.calories, round(f.calories*factor,1));
      new.protein_g := coalesce(new.protein_g, round(f.protein_g*factor,2));
      new.carbs_g := coalesce(new.carbs_g, round(f.carbs_g*factor,2));
      new.sugars_g := coalesce(new.sugars_g, round(f.sugars_g*factor,2));
      new.fiber_g := coalesce(new.fiber_g, round(f.fiber_g*factor,2));
      new.fat_g := coalesce(new.fat_g, round(f.fat_g*factor,2));
      new.saturated_fat_g := coalesce(new.saturated_fat_g, round(f.saturated_fat_g*factor,2));
      if new.custom_name is null then new.custom_name := f.name; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists food_log_fill on public.food_logs;
create trigger food_log_fill before insert or update on public.food_logs
  for each row execute function public.trg_food_log_fill();

drop view if exists public.daily_nutrition;
create view public.daily_nutrition with (security_invoker=true) as
select user_id, date,
  round(sum(calories),0) as calories, round(sum(protein_g),1) as protein_g,
  round(sum(carbs_g),1) as carbs_g, round(sum(sugars_g),1) as sugars_g,
  round(sum(fiber_g),1) as fiber_g, round(sum(fat_g),1) as fat_g,
  round(sum(saturated_fat_g),1) as saturated_fat_g, count(*) as items
from public.food_logs group by user_id, date;

create unique index if not exists nutrition_goals_user_uk on public.nutrition_goals(user_id);
alter table public.nutrition_goals
  add column if not exists objective text,
  add column if not exists weight_kg numeric,
  add column if not exists activity_factor numeric default 1.4,
  add column if not exists fiber_g numeric;

create or replace function public.compute_nutrition_targets(p_objective text default 'maintenance')
returns public.nutrition_goals language plpgsql security definer set search_path=public as $$
declare w numeric; kcal int; prot numeric; fat numeric; carb numeric; kpk numeric; res public.nutrition_goals%rowtype; uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'not authenticated'; end if;
  select weight into w from public.body_tracking where user_id=uid and weight is not null order by date desc limit 1;
  if w is null then w := 75; end if;
  kpk := case lower(coalesce(p_objective,'maintenance'))
    when 'bulk' then 38 when 'prise de masse' then 38
    when 'cut' then 26 when 'seche' then 26 when 'sèche' then 26
    when 'recomp' then 31 when 'recomposition' then 31
    else 33 end;
  kcal := round(w*kpk);
  prot := round(w*2.0);
  fat  := round(w*1.0);
  carb := round((kcal - (prot*4 + fat*9))/4.0);
  if carb < 0 then carb := 0; end if;
  insert into public.nutrition_goals(user_id, calories, proteins, carbs, fats, fiber_g, objective, weight_kg, updated_at)
  values (uid, kcal, prot, carb, fat, round(w*0.4), p_objective, w, now())
  on conflict (user_id) do update set
    calories=excluded.calories, proteins=excluded.proteins, carbs=excluded.carbs, fats=excluded.fats,
    fiber_g=excluded.fiber_g, objective=excluded.objective, weight_kg=excluded.weight_kg, updated_at=now()
  returning * into res;
  return res;
end $$;
grant execute on function public.compute_nutrition_targets(text) to authenticated, service_role;
notify pgrst, 'reload schema';
