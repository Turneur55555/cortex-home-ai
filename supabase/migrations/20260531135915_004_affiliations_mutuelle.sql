CREATE TABLE IF NOT EXISTS public.affiliations_mutuelle (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cle             TEXT NOT NULL UNIQUE,
  num_ss          TEXT,
  nom             TEXT,
  prenom          TEXT,
  date_naissance  TEXT,
  matricule       TEXT,
  statut          TEXT NOT NULL CHECK (statut IN ('couvert','radie','non_couvert')),
  couvert         BOOLEAN NOT NULL DEFAULT false,
  date_sortie     TEXT,
  motif_sortie    TEXT,
  motif_dispense  TEXT,
  etablissement   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliations_num_ss  ON public.affiliations_mutuelle(num_ss);
CREATE INDEX IF NOT EXISTS idx_affiliations_statut  ON public.affiliations_mutuelle(statut);
CREATE TRIGGER trg_affiliations_updated_at
  BEFORE UPDATE ON public.affiliations_mutuelle
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public.affiliations_mutuelle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliations_mutuelle_all" ON public.affiliations_mutuelle
  FOR ALL USING (auth.role() = 'authenticated');
ALTER TABLE public.controle_lignes ADD COLUMN IF NOT EXISTS num_ss          TEXT;
ALTER TABLE public.controle_lignes ADD COLUMN IF NOT EXISTS date_naissance  TEXT;
