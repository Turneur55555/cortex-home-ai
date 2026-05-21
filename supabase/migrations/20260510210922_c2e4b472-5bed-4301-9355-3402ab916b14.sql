DO $
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $;
ALTER TABLE public.items REPLICA IDENTITY FULL;