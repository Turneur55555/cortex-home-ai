-- Table de journalisation des erreurs front-end
CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_id text NOT NULL UNIQUE,
  user_id uuid,
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack text,
  source text,
  line integer,
  col integer,
  url text,
  route text,
  user_agent text,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_logs_user ON public.error_logs(user_id, created_at DESC);
CREATE INDEX idx_error_logs_support ON public.error_logs(support_id);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Insert: utilisateur connecté insère pour lui-même; autorise aussi anonyme avec user_id null
CREATE POLICY "Users insert own errors"
  ON public.error_logs FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

CREATE POLICY "Users view own errors"
  ON public.error_logs FOR SELECT
  USING (auth.uid() = user_id);
