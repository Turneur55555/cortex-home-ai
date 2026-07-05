create unique index if not exists foods_source_source_id_uk on public.foods (source, source_id);
notify pgrst, 'reload schema';
