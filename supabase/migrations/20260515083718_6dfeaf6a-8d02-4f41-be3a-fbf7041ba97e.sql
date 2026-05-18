ALTER TABLE public.users_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.users_profiles
  ADD CONSTRAINT users_profiles_display_name_length
  CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 3 AND 20));