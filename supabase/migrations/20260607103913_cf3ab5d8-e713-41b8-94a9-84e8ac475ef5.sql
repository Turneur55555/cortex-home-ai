
-- 1) Restrictive block policies on user_badges (no direct client writes)
CREATE POLICY "Block direct insert on user_badges"
  ON public.user_badges AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Block direct update on user_badges"
  ON public.user_badges AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

-- 2) Restrictive block policies on user_stats (writes only via triggers / service role)
CREATE POLICY "Block direct insert on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Block direct update on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Block direct delete on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- 3) Lock down SECURITY DEFINER functions from anonymous callers
REVOKE EXECUTE ON FUNCTION public.unlock_user_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ensure_home_categories_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_home_categories_for_me() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.compute_level_from_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_level_from_xp(integer) TO authenticated;
