-- =====================================================================
-- Sécurité — Cloisonnement RH/Paie vs Cortex (audit RLS, 29/08/2026)
--
-- Constat : ce projet Supabase héberge DEUX applications distinctes
-- partageant le même pool auth.users :
--   - Cortex (fitness) — utilisateurs identifiés par une ligne dans
--     public.users_profiles ;
--   - l'app RH/Paie (dossiers, DSN, arrêts maladie, contrats, STC,
--     contrôle de paie…) — utilisateurs identifiés par une ligne dans
--     public.profiles (role = 'gestionnaire').
--
-- La quasi-totalité des tables RH/Paie ont une policy
-- `USING (auth.role() = 'authenticated')` : elle ne vérifie QUE la
-- connexion, jamais l'appartenance à l'équipe RH/Paie. Un compte Cortex
-- authentifié (ex. turneur555@gmail.com, présent dans users_profiles
-- mais absent de profiles) peut donc aujourd'hui lire/écrire ces tables
-- via l'API REST Supabase.
--
-- Fix : remplacer `auth.role() = 'authenticated'` par une vérification
-- d'appartenance réelle à l'équipe RH/Paie (`public.is_paie_staff()`),
-- SANS changer le modèle de collaboration existant : les 3 gestionnaires
-- actuels (profiles.role = 'gestionnaire') continuent de voir tous les
-- dossiers comme aujourd'hui (outil interne collaboratif, pas de
-- cloisonnement par dossier/praticien demandé ni implémenté avant ce
-- correctif — on ne l'invente pas ici). Seul l'accès des comptes NON
-- membres de l'équipe RH/Paie (dont tout compte Cortex) est retiré.
--
-- Vérifié avant modification (voir session d'audit) :
--   - Aucun fichier src/ de Cortex ne référence ces tables (grep négatif) :
--     seul src/integrations/supabase/types.ts les connaît (types générés).
--   - app_settings ne contient qu'une clé 'cp_rules_config' (contrôle
--     paie) — confirmé non utilisé par Cortex.
--   - La vue public.v_briefing_matinal est déjà security_invoker=true
--     (migration sec2_view_security_invoker) : elle hérite automatiquement
--     de ce correctif sans modification propre.
--   - Le bucket storage 'paie-documents' n'a AUCUNE policy storage.objects
--     dédiée : RLS storage refuse déjà tout accès anon/authenticated par
--     défaut (deny-by-default), donc hors périmètre de cette migration.
--   - generer_taches_recurrentes() est déjà restreinte à service_role/
--     postgres — hors périmètre.
--   - historique_imports a déjà un filtre par propriétaire
--     (auth.uid() = created_by) : on AJOUTE la vérification d'équipe en
--     plus (AND), sans retirer le filtre par propriétaire existant.
-- =====================================================================

-- ── 1. Fonction d'appartenance à l'équipe RH/Paie ──────────────────────
-- SECURITY DEFINER : lit public.profiles sans dépendre de la policy de
-- profiles elle-même (évite toute ambiguïté d'auto-référence RLS).
CREATE OR REPLACE FUNCTION public.is_paie_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_paie_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_paie_staff() TO authenticated;

-- ── 2. Tables RH/Paie à accès collaboratif (toute l'équipe) ────────────
-- Remplace `auth.role() = 'authenticated'` par `public.is_paie_staff()`.
-- Comportement inchangé pour l'équipe RH/Paie, fermé pour le reste.

DROP POLICY IF EXISTS "dossiers_all" ON public.dossiers;
CREATE POLICY "dossiers_all" ON public.dossiers
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "taches_all" ON public.taches;
CREATE POLICY "taches_all" ON public.taches
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "auth_all_taches_recurrentes" ON public.taches_recurrentes;
CREATE POLICY "auth_all_taches_recurrentes" ON public.taches_recurrentes
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "echeances_all" ON public.echeances;
CREATE POLICY "echeances_all" ON public.echeances
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "dsn_all" ON public.dsn;
CREATE POLICY "dsn_all" ON public.dsn
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "arrets_all" ON public.arrets_maladie;
CREATE POLICY "arrets_all" ON public.arrets_maladie
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "stc_all" ON public.stc;
CREATE POLICY "stc_all" ON public.stc
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "contrats_all" ON public.contrats;
CREATE POLICY "contrats_all" ON public.contrats
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "silae_logs_authenticated" ON public.silae_sync_logs;
CREATE POLICY "silae_logs_authenticated" ON public.silae_sync_logs
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "controle_lignes_all" ON public.controle_lignes;
CREATE POLICY "controle_lignes_all" ON public.controle_lignes
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "regles_analyse_authenticated_all" ON public.regles_analyse;
CREATE POLICY "regles_analyse_authenticated_all" ON public.regles_analyse
  FOR ALL USING (public.is_paie_staff()) WITH CHECK (public.is_paie_staff());

DROP POLICY IF EXISTS "app_settings_all" ON public.app_settings;
CREATE POLICY "app_settings_all" ON public.app_settings
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "affiliations_mutuelle_all" ON public.affiliations_mutuelle;
CREATE POLICY "affiliations_mutuelle_all" ON public.affiliations_mutuelle
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "ca_praticiens_all" ON public.ca_praticiens;
CREATE POLICY "ca_praticiens_all" ON public.ca_praticiens
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "cp_historique_all" ON public.cp_historique;
CREATE POLICY "cp_historique_all" ON public.cp_historique
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "cp_controles_all" ON public.cp_controles;
CREATE POLICY "cp_controles_all" ON public.cp_controles
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "imports_all" ON public.imports;
CREATE POLICY "imports_all" ON public.imports
  FOR ALL USING (public.is_paie_staff());

DROP POLICY IF EXISTS "auth_all_dossier_documents" ON public.dossier_documents;
CREATE POLICY "auth_all_dossier_documents" ON public.dossier_documents
  FOR ALL USING (public.is_paie_staff());

-- ── 3. profiles — la fiche annuaire de l'équipe RH/Paie ────────────────
-- Lecture réservée à l'équipe elle-même (nécessaire pour les listes
-- d'assignation dossiers/tâches) ; l'update "own row" existant est
-- inchangé.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (public.is_paie_staff());

-- ── 4. historique_imports — garder le filtre par propriétaire, ajouter
--       la vérification d'équipe (défense en profondeur : un compte
--       Cortex ne doit pas pouvoir y insérer/lire même ses "propres"
--       lignes, puisqu'il ne devrait jamais pouvoir en créer) ─────────
DROP POLICY IF EXISTS "historique_imports_select" ON public.historique_imports;
CREATE POLICY "historique_imports_select" ON public.historique_imports
  FOR SELECT USING (public.is_paie_staff() AND auth.uid() = created_by);

DROP POLICY IF EXISTS "historique_imports_insert" ON public.historique_imports;
CREATE POLICY "historique_imports_insert" ON public.historique_imports
  FOR INSERT WITH CHECK (public.is_paie_staff() AND auth.uid() = created_by);

DROP POLICY IF EXISTS "historique_imports_update" ON public.historique_imports;
CREATE POLICY "historique_imports_update" ON public.historique_imports
  FOR UPDATE USING (public.is_paie_staff() AND auth.uid() = created_by)
  WITH CHECK (public.is_paie_staff() AND auth.uid() = created_by);

DROP POLICY IF EXISTS "historique_imports_delete" ON public.historique_imports;
CREATE POLICY "historique_imports_delete" ON public.historique_imports
  FOR DELETE USING (public.is_paie_staff() AND auth.uid() = created_by);
