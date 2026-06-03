
-- 1. user_stats: remove client write policies (triggers handle XP/level updates with SECURITY DEFINER)
DROP POLICY IF EXISTS "Users insert own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users update own stats" ON public.user_stats;

-- 2. user_badges: remove client write policies, expose a SECURITY DEFINER function
DROP POLICY IF EXISTS "Users insert own badges" ON public.user_badges;
DROP POLICY IF EXISTS "Users update own badges" ON public.user_badges;

CREATE OR REPLACE FUNCTION public.unlock_user_badge(_badge_key text)
RETURNS public.user_badges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  bc public.badges_catalog%ROWTYPE;
  ok boolean := false;
  cnt integer;
  inserted public.user_badges%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO bc FROM public.badges_catalog WHERE badge_key = _badge_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown badge';
  END IF;

  -- Server-side criteria validation for verifiable types
  IF bc.requirement_type = 'workouts_count' THEN
    SELECT count(*) INTO cnt FROM public.workouts WHERE user_id = uid;
    ok := cnt >= bc.requirement_value;
  ELSIF bc.requirement_type = 'goals_completed' THEN
    SELECT count(*) INTO cnt FROM public.goals WHERE user_id = uid AND is_completed = true;
    ok := cnt >= bc.requirement_value;
  ELSIF bc.requirement_type = 'body_measurements' THEN
    SELECT count(*) INTO cnt FROM public.body_tracking WHERE user_id = uid;
    ok := cnt >= bc.requirement_value;
  ELSIF bc.requirement_type = 'weekly_workouts' THEN
    SELECT count(*) INTO cnt FROM public.workouts
      WHERE user_id = uid AND created_at >= date_trunc('week', now());
    ok := cnt >= bc.requirement_value;
  ELSIF bc.requirement_type IN ('streak_days','protein_days') THEN
    -- Computed client-side from derived data; accept request (xp/metadata still come from catalog)
    ok := true;
  ELSE
    ok := false;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Criteria not met';
  END IF;

  INSERT INTO public.user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description, unlocked_at)
  VALUES (uid, bc.badge_key, bc.label, bc.icon, bc.rarity, bc.xp_reward, bc.description, now())
  ON CONFLICT (user_id, badge_key) DO NOTHING
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_user_badge(text) FROM public;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

-- 3. Storage policies: re-scope to authenticated role only
DROP POLICY IF EXISTS "Users upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own files" ON storage.objects;

CREATE POLICY "Users upload own files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents')
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
CREATE POLICY "Users update own files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents')
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('food-images','clothes-images','pharmacy-images','pdf-documents')
  AND auth.uid()::text = (storage.foldername(name))[1]
);
