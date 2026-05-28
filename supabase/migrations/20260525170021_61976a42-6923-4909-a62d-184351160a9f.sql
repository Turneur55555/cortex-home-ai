-- 1) Block direct client INSERT on rate_limits (service role only)
DROP POLICY IF EXISTS "Users insert own rate limits" ON public.rate_limits;
CREATE POLICY "Block insert on rate_limits"
  ON public.rate_limits
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2) Revoke direct access to internal seed function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='_seed_home_categories_for_user'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._seed_home_categories_for_user(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 3) Restrict exercise-images storage policies to authenticated role
DROP POLICY IF EXISTS "Users read own exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Users update own exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own exercise images" ON storage.objects;

CREATE POLICY "Users read own exercise images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users upload own exercise images" ON storage.objects;
CREATE POLICY "Users upload own exercise images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercise-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own exercise images" ON storage.objects;
CREATE POLICY "Users update own exercise images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exercise-images' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'exercise-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own exercise images" ON storage.objects;
CREATE POLICY "Users delete own exercise images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercise-images' AND (auth.uid())::text = (storage.foldername(name))[1]);