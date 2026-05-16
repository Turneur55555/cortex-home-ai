DROP POLICY IF EXISTS "Users update own profile" ON public.users_profiles;

CREATE POLICY "Users update own profile"
ON public.users_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND premium = (SELECT premium FROM public.users_profiles WHERE id = auth.uid())
);