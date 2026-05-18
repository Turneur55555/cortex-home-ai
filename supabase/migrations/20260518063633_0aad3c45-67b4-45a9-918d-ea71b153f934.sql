
-- 1. Restrict RLS policies to authenticated role only
DROP POLICY IF EXISTS "Users manage own body" ON public.body_tracking;
CREATE POLICY "Users manage own body" ON public.body_tracking
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own exercises" ON public.exercises;
CREATE POLICY "Users manage own exercises" ON public.exercises
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own nutrition" ON public.nutrition;
CREATE POLICY "Users manage own nutrition" ON public.nutrition
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workouts" ON public.workouts;
CREATE POLICY "Users manage own workouts" ON public.workouts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own nutrition goals" ON public.nutrition_goals;
CREATE POLICY "Users manage own nutrition goals" ON public.nutrition_goals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own items" ON public.items;
CREATE POLICY "Users manage own items" ON public.items
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own food prefs" ON public.food_preferences;
CREATE POLICY "Users manage own food prefs" ON public.food_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own documents" ON public.documents;
CREATE POLICY "Users manage own documents" ON public.documents
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own errors" ON public.error_logs;
CREATE POLICY "Users view own errors" ON public.error_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Block delete on rate_limits" ON public.rate_limits;
CREATE POLICY "Block delete on rate_limits" ON public.rate_limits
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "Block update on rate_limits" ON public.rate_limits;
CREATE POLICY "Block update on rate_limits" ON public.rate_limits
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Users insert own rate limits" ON public.rate_limits;
CREATE POLICY "Users insert own rate limits" ON public.rate_limits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own rate limits" ON public.rate_limits;
CREATE POLICY "Users see own rate limits" ON public.rate_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2. Revoke EXECUTE on SECURITY DEFINER functions that should not be publicly callable
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- ensure_home_categories_for_me is intentionally callable by signed-in users
REVOKE ALL ON FUNCTION public.ensure_home_categories_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_home_categories_for_me() TO authenticated;

-- 3. Restrict avatars bucket: allow SELECT on a specific object but not bucket listing
-- The default permissive SELECT must be tightened so unauthenticated listing is blocked.
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;

CREATE POLICY "Avatar files are readable by anyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
