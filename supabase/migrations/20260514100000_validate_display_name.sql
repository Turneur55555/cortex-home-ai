-- ============================================================
-- Validate and harden the display_name column on users_profiles.
-- ============================================================

-- 1. Ensure the column exists (idempotent — already added in 20260514000001
--    but this guarantees forward-compatibility for fresh deployments).
ALTER TABLE public.users_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Add CHECK constraint: NULL is allowed (= pseudo not yet chosen),
--    but any non-null value must be 3-20 chars (mirrors frontend validation).
ALTER TABLE public.users_profiles
  DROP CONSTRAINT IF EXISTS users_profiles_display_name_length;

ALTER TABLE public.users_profiles
  ADD CONSTRAINT users_profiles_display_name_length
  CHECK (
    display_name IS NULL
    OR (char_length(display_name) >= 3 AND char_length(display_name) <= 20)
  );

-- 3. Partial index for fast lookups when display_name is set.
CREATE INDEX IF NOT EXISTS idx_users_profiles_display_name
  ON public.users_profiles (display_name)
  WHERE display_name IS NOT NULL;

-- 4. Verify RLS policies are in place (they were created in the initial
--    migration; this block re-asserts them without breaking anything).
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'users_profiles'
      AND policyname = 'Users select own profile'
  ) THEN
    CREATE POLICY "Users select own profile" ON public.users_profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'users_profiles'
      AND policyname = 'Users insert own profile'
  ) THEN
    CREATE POLICY "Users insert own profile" ON public.users_profiles
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = id AND premium = false);
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'users_profiles'
      AND policyname = 'Users update own profile'
  ) THEN
    CREATE POLICY "Users update own profile" ON public.users_profiles
      FOR UPDATE TO authenticated
      USING  (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END;
$$;
