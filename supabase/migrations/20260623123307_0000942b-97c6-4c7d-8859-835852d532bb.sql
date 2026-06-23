
-- 1) Remove items table from realtime publication (module deleted; prevents cross-user broadcast)
ALTER PUBLICATION supabase_realtime DROP TABLE public.items;

-- 2) Fix rate-limit enforcement: drop the restrictive block-all-inserts policy and add a permissive
--    user-scoped insert policy so edge functions (using a user-scoped client) can actually record usage.
DROP POLICY IF EXISTS "Block insert on rate_limits" ON public.rate_limits;
CREATE POLICY "Users insert own rate limits"
  ON public.rate_limits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3) Update CHECK constraint to cover all action names used by edge functions
ALTER TABLE public.rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf','scan_fridge','scan_meal','coach_workout','recipe_assistant',
    'muscle_readiness','chat','scan_image','analyze_image','scan_exercise'
  ]));
