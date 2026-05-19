
-- user_badges: remove ALL policy, allow SELECT only from client
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_badges'
  ) THEN
    DROP POLICY IF EXISTS "Users manage own badges" ON public.user_badges;
    DROP POLICY IF EXISTS "Users view own badges"  ON public.user_badges;
    CREATE POLICY "Users view own badges"
      ON public.user_badges
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- user_stats: remove ALL policy, allow SELECT only from client
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_stats'
  ) THEN
    DROP POLICY IF EXISTS "Users manage own stats" ON public.user_stats;
    DROP POLICY IF EXISTS "Users view own stats"  ON public.user_stats;
    CREATE POLICY "Users view own stats"
      ON public.user_stats
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
