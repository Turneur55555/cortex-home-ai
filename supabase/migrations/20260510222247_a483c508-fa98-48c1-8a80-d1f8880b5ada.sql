
CREATE POLICY "Block update on rate_limits"
ON public.rate_limits AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);

CREATE POLICY "Block delete on rate_limits"
ON public.rate_limits AS RESTRICTIVE FOR DELETE TO public USING (false);
