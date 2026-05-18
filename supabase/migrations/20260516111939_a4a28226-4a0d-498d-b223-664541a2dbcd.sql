DROP FUNCTION IF EXISTS public.enforce_free_plan_items() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_free_plan_documents() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_premium_self_update() CASCADE;

DROP POLICY IF EXISTS "Users insert own profile" ON public.users_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.users_profiles;
DROP POLICY IF EXISTS "Users select own profile" ON public.users_profiles;

ALTER TABLE public.users_profiles DROP COLUMN IF EXISTS premium;

CREATE POLICY "Users select own profile"
  ON public.users_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON public.users_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.users_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
