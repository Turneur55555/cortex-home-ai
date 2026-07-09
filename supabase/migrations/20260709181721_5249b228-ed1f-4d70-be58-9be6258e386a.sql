
ALTER TABLE public.users_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;
