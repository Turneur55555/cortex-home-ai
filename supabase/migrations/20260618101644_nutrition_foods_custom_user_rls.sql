-- Aliments personnalisés intégrés au catalogue (modèle MyFitnessPal)
alter table public.foods add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_foods_user_id on public.foods (user_id);

-- Lecture : catalogue public (user_id null) + ses propres aliments
drop policy if exists "foods readable by authenticated" on public.foods;
drop policy if exists foods_select_public_or_own on public.foods;
create policy foods_select_public_or_own on public.foods
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

-- Écriture : uniquement ses propres aliments (source='custom')
drop policy if exists foods_insert_own on public.foods;
create policy foods_insert_own on public.foods
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists foods_update_own on public.foods;
create policy foods_update_own on public.foods
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists foods_delete_own on public.foods;
create policy foods_delete_own on public.foods
  for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';
