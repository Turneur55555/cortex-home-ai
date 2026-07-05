-- 002 Contrôle de paie : imports + controle_lignes
CREATE TABLE IF NOT EXISTS public.imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nom_fichier   TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'teulade' CHECK (type IN ('teulade', 'prat', 'admin')),
  periode       TEXT,
  nb_lignes     INTEGER NOT NULL DEFAULT 0,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imports_periode      ON public.imports(periode);
CREATE INDEX IF NOT EXISTS idx_imports_type         ON public.imports(type);
CREATE INDEX IF NOT EXISTS idx_imports_user         ON public.imports(user_id);
CREATE INDEX IF NOT EXISTS idx_imports_uploaded_at  ON public.imports(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS public.controle_lignes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id       UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  matricule       TEXT NOT NULL,
  salarie         TEXT,
  centre          TEXT,
  periode         TEXT,
  emploi          TEXT,
  categorie       TEXT,
  type_contrat    TEXT,
  brut            NUMERIC(12, 2),
  net             NUMERIC(12, 2),
  charges         NUMERIC(12, 2),
  ms_hors_ts      NUMERIC(12, 2),
  ca              NUMERIC(12, 2),
  heures_m        NUMERIC(10, 2),
  heures_m1       NUMERIC(10, 2),
  salaire_m       NUMERIC(12, 2),
  salaire_m1      NUMERIC(12, 2),
  mutuelle_m      NUMERIC(10, 2),
  mutuelle_m1     NUMERIC(10, 2),
  taux_m          NUMERIC(10, 4),
  taux_m1         NUMERIC(10, 4),
  heures_reel     NUMERIC(10, 2),
  pas             NUMERIC(10, 2),
  acompte         NUMERIC(12, 2),
  pct_specifique  NUMERIC(10, 4),
  date_entree     TEXT,
  date_sortie     TEXT,
  commentaire     TEXT,
  anomalies       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_controle_lignes_import     ON public.controle_lignes(import_id);
CREATE INDEX IF NOT EXISTS idx_controle_lignes_matricule  ON public.controle_lignes(matricule, periode);
CREATE INDEX IF NOT EXISTS idx_controle_lignes_periode    ON public.controle_lignes(periode);
CREATE INDEX IF NOT EXISTS idx_controle_lignes_anomalies  ON public.controle_lignes USING GIN(anomalies);

DROP TRIGGER IF EXISTS trg_imports_updated_at ON public.imports;
CREATE TRIGGER trg_imports_updated_at
  BEFORE UPDATE ON public.imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.imports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_lignes  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "imports_all" ON public.imports;
CREATE POLICY "imports_all"          ON public.imports         FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "controle_lignes_all"  ON public.controle_lignes FOR ALL USING (auth.role() = 'authenticated');
