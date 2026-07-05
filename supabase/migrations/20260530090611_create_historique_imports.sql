
-- Table historique des imports paie (suivi % Praticien mois par mois)
CREATE TABLE IF NOT EXISTS historique_imports (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  periode       varchar(7)   NOT NULL,  -- 'YYYY-MM'
  periode_label varchar(20)  NOT NULL,  -- 'Mai 2025'
  matricule     varchar(20)  NOT NULL,
  salarie       varchar(150) NOT NULL,
  centre        varchar(100) DEFAULT '',
  emploi        varchar(150) DEFAULT '',
  categorie     varchar(100) DEFAULT '',
  file_type     varchar(10)  DEFAULT 'teulade', -- 'teulade' | 'prat' | 'admin'
  taux_m1       numeric(6,2) DEFAULT 0,
  taux_m        numeric(6,2) DEFAULT 0,
  diff_taux     numeric(6,2) DEFAULT 0,
  salaire_m1    numeric(12,2) DEFAULT 0,
  salaire_m     numeric(12,2) DEFAULT 0,
  diff_salaire  numeric(12,2) DEFAULT 0,
  heures_m1     numeric(7,2) DEFAULT 0,
  heures_m      numeric(7,2) DEFAULT 0,
  has_error     boolean DEFAULT false,
  error_reason  text DEFAULT '',
  dossier_id    uuid REFERENCES dossiers(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- Index pour requêtes rapides par période et matricule
CREATE INDEX IF NOT EXISTS idx_historique_imports_periode   ON historique_imports(periode);
CREATE INDEX IF NOT EXISTS idx_historique_imports_matricule ON historique_imports(matricule);
CREATE INDEX IF NOT EXISTS idx_historique_imports_categorie ON historique_imports(categorie);
CREATE INDEX IF NOT EXISTS idx_historique_imports_dossier   ON historique_imports(dossier_id);

-- RLS
ALTER TABLE historique_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historique_imports_select" ON historique_imports;
CREATE POLICY "historique_imports_select" ON historique_imports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "historique_imports_insert" ON historique_imports;
CREATE POLICY "historique_imports_insert" ON historique_imports
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "historique_imports_delete" ON historique_imports;
CREATE POLICY "historique_imports_delete" ON historique_imports
  FOR DELETE USING (true);

CREATE POLICY "historique_imports_update" ON historique_imports
  FOR UPDATE USING (true);
