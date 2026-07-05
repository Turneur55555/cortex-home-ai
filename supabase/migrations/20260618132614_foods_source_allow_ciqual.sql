alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check
  check (source = any (array['usda','icortex','custom','ciqual']));
notify pgrst, 'reload schema';
