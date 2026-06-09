
-- 1) Clamp XP awarded by goal completion to prevent arbitrary inflation
CREATE OR REPLACE FUNCTION public.award_xp_on_goal_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_xp integer;
  awarded integer;
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.is_completed = true AND COALESCE(OLD.is_completed,false) = false)
     OR (TG_OP = 'INSERT' AND NEW.is_completed = true) THEN
    -- Cap the XP reward to mitigate client-supplied inflated values
    awarded := LEAST(GREATEST(COALESCE(NEW.xp_reward, 0), 0), 500);

    INSERT INTO public.user_stats (user_id, xp, level, total_actions)
    VALUES (NEW.user_id, awarded, 1, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET xp = public.user_stats.xp + awarded,
          total_actions = public.user_stats.total_actions + 1,
          updated_at = now()
    RETURNING xp INTO new_xp;

    UPDATE public.user_stats
      SET level = public.compute_level_from_xp(new_xp)
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Server-side verification for streak_days and protein_days badges
CREATE OR REPLACE FUNCTION public.unlock_user_badge(_badge_key text)
 RETURNS user_badges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  bc public.badges_catalog%ROWTYPE;
  ok boolean := false;
  cnt integer;
  streak_len integer;
  protein_goal double precision;
  inserted public.user_badges%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO bc FROM public.badges_catalog WHERE badge_key = _badge_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown badge';
  END IF;

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
  ELSIF bc.requirement_type = 'streak_days' THEN
    -- Length of current streak: consecutive distinct workout dates ending today or yesterday
    WITH d AS (
      SELECT DISTINCT date FROM public.workouts WHERE user_id = uid
    ),
    grouped AS (
      SELECT date, (date - (row_number() OVER (ORDER BY date))::int) AS grp FROM d
    ),
    runs AS (
      SELECT max(date) AS last_date, count(*) AS run_len FROM grouped GROUP BY grp
    )
    SELECT run_len INTO streak_len
    FROM runs
    WHERE last_date >= (CURRENT_DATE - INTERVAL '1 day')::date
    ORDER BY last_date DESC
    LIMIT 1;
    ok := COALESCE(streak_len, 0) >= bc.requirement_value;
  ELSIF bc.requirement_type = 'protein_days' THEN
    -- Number of distinct dates where total protein intake met the user's nutrition goal
    SELECT proteins INTO protein_goal FROM public.nutrition_goals WHERE user_id = uid;
    IF protein_goal IS NULL OR protein_goal <= 0 THEN
      ok := false;
    ELSE
      SELECT count(*) INTO cnt FROM (
        SELECT date, sum(COALESCE(proteins, 0)) AS total
        FROM public.nutrition
        WHERE user_id = uid
        GROUP BY date
        HAVING sum(COALESCE(proteins, 0)) >= protein_goal
      ) q;
      ok := cnt >= bc.requirement_value;
    END IF;
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
$function$;

-- 3) Add UPDATE policy on user_pdfs scoped to owner
DROP POLICY IF EXISTS "Users update own pdfs" ON public.user_pdfs;
CREATE POLICY "Users update own pdfs" ON public.user_pdfs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Add WITH CHECK clauses on storage UPDATE policies to prevent ownership change
DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
CREATE POLICY "Users update own files" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = ANY (ARRAY['food-images','clothes-images','pharmacy-images','pdf-documents'])
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['food-images','clothes-images','pharmacy-images','pdf-documents'])
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
