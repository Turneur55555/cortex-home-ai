-- Perf P4 (advisors Supabase) : index dupliqués + policies permissives multiples.

-- foods : foods_source_source_id_key (contrainte UNIQUE) suffit.
drop index if exists public.foods_source_source_id_uk;

-- nutrition_goals : la PK (user_id) suffit.
drop index if exists public.nutrition_goals_user_uk;

-- recipes : une seule policy par action (SELECT était couvert 2 fois).
drop policy if exists recipes_modify_own on public.recipes;
drop policy if exists recipes_select_own_or_public on public.recipes;

create policy recipes_select_own_or_public on public.recipes
  for select to authenticated
  using ((user_id = (select auth.uid())) or is_public);

create policy recipes_insert_own on public.recipes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy recipes_update_own on public.recipes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recipes_delete_own on public.recipes
  for delete to authenticated
  using (user_id = (select auth.uid()));
