DROP POLICY IF EXISTS "Users insert own errors" ON public.error_logs;

CREATE POLICY "Users insert own errors"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);