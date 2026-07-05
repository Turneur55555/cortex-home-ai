-- ============================================================
-- Migration 007 — Performance module Contrôle Paie
-- 1) Policies RLS : auth.role() encapsulé dans un sous-select
--    (évite la réévaluation par ligne — advisor auth_rls_initplan)
-- 2) Index sur les clés étrangères non indexées du module
-- ============================================================

-- 1) RLS optimisé
DROP POLICY IF EXISTS "imports_all" ON public.imports;
CREATE POLICY "imports_all" ON public.imports
  FOR ALL USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "controle_lignes_all" ON public.controle_lignes;
CREATE POLICY "controle_lignes_all" ON public.controle_lignes
  FOR ALL USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "cp_controles_all" ON public.cp_controles;
CREATE POLICY "cp_controles_all" ON public.cp_controles
  FOR ALL USING ((select auth.role()) = 'authenticated');

-- 2) Index FK manquants
CREATE INDEX IF NOT EXISTS idx_cp_controles_created_by ON public.cp_controles(created_by);
CREATE INDEX IF NOT EXISTS idx_cp_controles_import ON public.cp_controles(import_id);
CREATE INDEX IF NOT EXISTS idx_histimports_dossier ON public.historique_imports(dossier_id);
CREATE INDEX IF NOT EXISTS idx_histimports_created_by ON public.historique_imports(created_by);
