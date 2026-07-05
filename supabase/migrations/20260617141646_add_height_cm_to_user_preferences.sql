ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS height_cm numeric;
NOTIFY pgrst, 'reload schema';
