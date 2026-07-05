ALTER TABLE public.controle_lignes ADD COLUMN IF NOT EXISTS rpps TEXT;
CREATE INDEX IF NOT EXISTS idx_controle_lignes_rpps ON public.controle_lignes(rpps);

CREATE TABLE IF NOT EXISTS public.ca_praticiens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cle           TEXT NOT NULL UNIQUE,
  rpps          TEXT NOT NULL,
  centre        TEXT NOT NULL,
  praticien     TEXT,
  specialite    TEXT,
  periode       TEXT NOT NULL,
  ca            NUMERIC,
  perte_profit  NUMERIC,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_praticiens_rpps    ON public.ca_praticiens(rpps);
CREATE INDEX IF NOT EXISTS idx_ca_praticiens_periode ON public.ca_praticiens(periode);

DROP TRIGGER IF EXISTS trg_ca_praticiens_updated_at ON public.ca_praticiens;
CREATE TRIGGER trg_ca_praticiens_updated_at
  BEFORE UPDATE ON public.ca_praticiens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.ca_praticiens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ca_praticiens_all" ON public.ca_praticiens;
CREATE POLICY "ca_praticiens_all" ON public.ca_praticiens
  FOR ALL USING (auth.role() = 'authenticated');
