
-- Table de suivi des synchronisations Silae
CREATE TABLE IF NOT EXISTS public.silae_sync_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type      TEXT        NOT NULL CHECK (sync_type IN ('dossiers','salaries','dsn','bulletins')),
  status         TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  records_synced INTEGER     NOT NULL DEFAULT 0,
  error_message  TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);

ALTER TABLE public.silae_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "silae_logs_authenticated" ON public.silae_sync_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_silae_logs_type ON public.silae_sync_logs(sync_type);
CREATE INDEX idx_silae_logs_started ON public.silae_sync_logs(started_at DESC);
