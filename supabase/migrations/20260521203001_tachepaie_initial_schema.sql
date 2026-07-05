
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- TABLE : profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'gestionnaire' CHECK (role IN ('admin', 'gestionnaire', 'consultant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE : dossiers
CREATE TABLE IF NOT EXISTS public.dossiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  siret TEXT,
  responsable_id UUID REFERENCES public.profiles(id),
  statut TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'blocked', 'completed', 'archived')),
  priorite TEXT NOT NULL DEFAULT 'medium' CHECK (priorite IN ('urgent', 'high', 'medium', 'low')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  progression INTEGER NOT NULL DEFAULT 0 CHECK (progression BETWEEN 0 AND 100),
  nb_salaries INTEGER NOT NULL DEFAULT 0,
  prochaine_echeance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossiers_statut ON public.dossiers(statut);
CREATE INDEX IF NOT EXISTS idx_dossiers_priorite ON public.dossiers(priorite);
CREATE INDEX IF NOT EXISTS idx_dossiers_responsable ON public.dossiers(responsable_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_nom_trgm ON public.dossiers USING GIN(nom gin_trgm_ops);

-- TABLE : taches
CREATE TABLE IF NOT EXISTS public.taches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT,
  categorie TEXT NOT NULL DEFAULT 'autre' CHECK (categorie IN ('dsn', 'paie', 'arret_maladie', 'stc', 'contrat', 'charges', 'acompte', 'autre')),
  priorite TEXT NOT NULL DEFAULT 'medium' CHECK (priorite IN ('urgent', 'high', 'medium', 'low')),
  statut TEXT NOT NULL DEFAULT 'todo' CHECK (statut IN ('todo', 'in_progress', 'blocked', 'done')),
  assignee_id UUID REFERENCES public.profiles(id),
  echeance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taches_dossier ON public.taches(dossier_id);
CREATE INDEX IF NOT EXISTS idx_taches_statut ON public.taches(statut);
CREATE INDEX IF NOT EXISTS idx_taches_priorite ON public.taches(priorite);
CREATE INDEX IF NOT EXISTS idx_taches_echeance ON public.taches(echeance) WHERE echeance IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taches_assignee ON public.taches(assignee_id);

-- TABLE : echeances
CREATE TABLE IF NOT EXISTS public.echeances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'autre' CHECK (type IN ('dsn', 'charges', 'virement', 'acompte', 'stc', 'autre')),
  date_echeance DATE NOT NULL,
  statut TEXT NOT NULL DEFAULT 'upcoming' CHECK (statut IN ('upcoming', 'due_today', 'overdue', 'completed')),
  montant NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_echeances_date ON public.echeances(date_echeance);
CREATE INDEX IF NOT EXISTS idx_echeances_statut ON public.echeances(statut);
CREATE INDEX IF NOT EXISTS idx_echeances_dossier ON public.echeances(dossier_id);

-- TABLE : dsn
CREATE TABLE IF NOT EXISTS public.dsn (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mensuelle' CHECK (type IN ('mensuelle', 'signalement')),
  statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'deposee', 'acceptee', 'rejetee')),
  date_limite DATE NOT NULL,
  date_depot DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsn_dossier ON public.dsn(dossier_id);
CREATE INDEX IF NOT EXISTS idx_dsn_statut ON public.dsn(statut);
CREATE INDEX IF NOT EXISTS idx_dsn_periode ON public.dsn(periode);

-- TABLE : arrets_maladie
CREATE TABLE IF NOT EXISTS public.arrets_maladie (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  salarie_nom TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE,
  type TEXT NOT NULL DEFAULT 'maladie' CHECK (type IN ('maladie', 'maternite', 'paternite', 'accident_travail')),
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'termine', 'prolonge')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arrets_dossier ON public.arrets_maladie(dossier_id);
CREATE INDEX IF NOT EXISTS idx_arrets_statut ON public.arrets_maladie(statut);

-- TABLE : stc
CREATE TABLE IF NOT EXISTS public.stc (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  salarie_nom TEXT NOT NULL,
  motif TEXT NOT NULL CHECK (motif IN ('demission', 'licenciement', 'rupture_conventionnelle', 'fin_cdd', 'autre')),
  date_sortie DATE NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'termine')),
  montant NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stc_dossier ON public.stc(dossier_id);
CREATE INDEX IF NOT EXISTS idx_stc_statut ON public.stc(statut);

-- TABLE : contrats
CREATE TABLE IF NOT EXISTS public.contrats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  salarie_nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CDI', 'CDD', 'intérim', 'apprentissage', 'stage')),
  date_debut DATE NOT NULL,
  date_fin DATE,
  salaire_brut NUMERIC(10, 2) NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'termine')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrats_dossier ON public.contrats(dossier_id);
CREATE INDEX IF NOT EXISTS idx_contrats_statut ON public.contrats(statut);
CREATE INDEX IF NOT EXISTS idx_contrats_date_fin ON public.contrats(date_fin) WHERE date_fin IS NOT NULL;

-- TRIGGERS : updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dossiers_updated_at ON public.dossiers;
CREATE TRIGGER trg_dossiers_updated_at BEFORE UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_taches_updated_at ON public.taches;
CREATE TRIGGER trg_taches_updated_at BEFORE UPDATE ON public.taches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrets_maladie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "dossiers_all" ON public.dossiers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "taches_all" ON public.taches FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "echeances_all" ON public.echeances FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "dsn_all" ON public.dsn FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "arrets_all" ON public.arrets_maladie FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "stc_all" ON public.stc FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "contrats_all" ON public.contrats FOR ALL USING (auth.role() = 'authenticated');

-- Trigger création profil automatique
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
