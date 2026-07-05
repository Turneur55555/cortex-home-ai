-- ============================================================
-- Migration 006 — Refonte Contrôle Paie
-- 1) Anti-doublons sur les imports (hash de contenu)
-- 2) Table cp_controles : historique complet des contrôles
-- 3) Anti-doublons historique_imports + index performance
-- ============================================================

-- 1) Hash de contenu pour unicité des imports
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_imports_file_hash ON public.imports(file_hash);

-- 2) Historique des contrôles
CREATE TABLE IF NOT EXISTS public.cp_controles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID UNIQUE REFERENCES public.imports(id) ON DELETE CASCADE,
  periode TEXT,
  periode_label TEXT,
  fichier TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'teulade' CHECK (file_type IN ('teulade','prat','admin')),
  nb_salaries INTEGER NOT NULL DEFAULT 0,
  nb_anomalies INTEGER NOT NULL DEFAULT 0,
  nb_critiques INTEGER NOT NULL DEFAULT 0,
  masse_salariale NUMERIC(14,2) DEFAULT 0,
  ecart_global NUMERIC(14,2) DEFAULT 0,
  resultat TEXT NOT NULL DEFAULT 'ok' CHECK (resultat IN ('ok','warning','error')),
  commentaire TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_controles_periode ON public.cp_controles(periode);
CREATE INDEX IF NOT EXISTS idx_cp_controles_created_at ON public.cp_controles(created_at DESC);

DROP TRIGGER IF EXISTS trg_cp_controles_updated_at ON public.cp_controles;
CREATE TRIGGER trg_cp_controles_updated_at
  BEFORE UPDATE ON public.cp_controles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.cp_controles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cp_controles_all" ON public.cp_controles;
CREATE POLICY "cp_controles_all" ON public.cp_controles FOR ALL USING (auth.role() = 'authenticated');

-- 3) Dédoublonnage puis contrainte d'unicité sur historique_imports
DELETE FROM public.historique_imports a
  USING public.historique_imports b
  WHERE a.ctid < b.ctid
    AND a.periode = b.periode
    AND a.matricule = b.matricule
    AND a.file_type = b.file_type;
CREATE UNIQUE INDEX IF NOT EXISTS uq_histimports_periode_type_mat
  ON public.historique_imports(periode, file_type, matricule);

-- 4) Index performance complémentaires
CREATE INDEX IF NOT EXISTS idx_histimports_periode ON public.historique_imports(periode DESC);
CREATE INDEX IF NOT EXISTS idx_controle_lignes_centre ON public.controle_lignes(centre);
CREATE INDEX IF NOT EXISTS idx_imports_periode_type ON public.imports(periode, type);
