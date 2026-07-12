-- 1) exercise_reference: drop permissive authenticated write policies, keep service_role only
DROP POLICY IF EXISTS "exercise_reference authenticated insert" ON public.exercise_reference;
DROP POLICY IF EXISTS "exercise_reference authenticated update" ON public.exercise_reference;
DROP POLICY IF EXISTS "exercise_reference authenticated delete" ON public.exercise_reference;

REVOKE INSERT, UPDATE, DELETE ON public.exercise_reference FROM authenticated;

CREATE POLICY "exercise_reference service_role insert"
  ON public.exercise_reference FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "exercise_reference service_role update"
  ON public.exercise_reference FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "exercise_reference service_role delete"
  ON public.exercise_reference FOR DELETE
  TO service_role USING (true);

-- 2) avatars bucket: drop redundant authenticated-only SELECT policy (public SELECT remains)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND cmd = 'SELECT'
       AND 'authenticated' = ANY(roles)
       AND NOT ('public' = ANY(roles))
       AND qual LIKE '%avatars%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;