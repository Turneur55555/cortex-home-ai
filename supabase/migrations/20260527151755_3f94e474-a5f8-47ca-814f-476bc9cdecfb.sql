
CREATE TABLE public.calendar_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_tokens TO authenticated;
GRANT ALL ON public.calendar_tokens TO service_role;

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calendar tokens" ON public.calendar_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own calendar tokens" ON public.calendar_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own calendar tokens" ON public.calendar_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own calendar tokens" ON public.calendar_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_calendar_tokens_token ON public.calendar_tokens(token);
