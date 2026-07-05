
-- Table historique des contrôles de paie
CREATE TABLE IF NOT EXISTS public.cp_historique (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period           TEXT NOT NULL,
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sans_mutuelle    JSONB NOT NULL DEFAULT '[]',
  taux_problemes   JSONB NOT NULL DEFAULT '[]',
  total_salaries   INTEGER NOT NULL DEFAULT 0,
  total_anomalies  INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (period, created_by)
);

CREATE INDEX IF NOT EXISTS idx_cp_historique_period ON public.cp_historique(period);
CREATE INDEX IF NOT EXISTS idx_cp_historique_saved_at ON public.cp_historique(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_historique_created_by ON public.cp_historique(created_by);

ALTER TABLE public.cp_historique ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cp_historique_all" ON public.cp_historique;
CREATE POLICY "cp_historique_all" ON public.cp_historique FOR ALL USING (auth.role() = 'authenticated');
