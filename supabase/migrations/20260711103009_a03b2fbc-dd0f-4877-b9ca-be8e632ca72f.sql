
-- 1. Lock down exercise_catalog: keep SELECT for authenticated, restrict writes to service_role
DROP POLICY IF EXISTS "Authenticated can insert catalog" ON public.exercise_catalog;
DROP POLICY IF EXISTS "Authenticated can update catalog" ON public.exercise_catalog;
DROP POLICY IF EXISTS "Authenticated can delete catalog" ON public.exercise_catalog;

CREATE POLICY "Service role can insert catalog"
  ON public.exercise_catalog FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can update catalog" ON public.exercise_catalog;
CREATE POLICY "Service role can update catalog"
  ON public.exercise_catalog FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can delete catalog" ON public.exercise_catalog;
CREATE POLICY "Service role can delete catalog"
  ON public.exercise_catalog FOR DELETE TO service_role USING (true);

-- 2. Restrict get_user_streak_days SECURITY DEFINER function to authenticated only
REVOKE EXECUTE ON FUNCTION public.get_user_streak_days() FROM PUBLIC, anon;
