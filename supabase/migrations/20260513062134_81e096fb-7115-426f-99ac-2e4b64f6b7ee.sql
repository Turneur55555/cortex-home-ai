DROP POLICY IF EXISTS "Users insert own profile" ON public.users_profiles;
CREATE POLICY "Users insert own profile"
ON public.users_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND premium = false);