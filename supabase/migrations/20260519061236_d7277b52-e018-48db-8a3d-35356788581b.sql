
-- user_badges: remove ALL policy, allow SELECT only from client
DROP POLICY IF EXISTS "Users manage own badges" ON public.user_badges;
CREATE POLICY "Users view own badges"
  ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- user_stats: remove ALL policy, allow SELECT only from client
DROP POLICY IF EXISTS "Users manage own stats" ON public.user_stats;
CREATE POLICY "Users view own stats"
  ON public.user_stats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
