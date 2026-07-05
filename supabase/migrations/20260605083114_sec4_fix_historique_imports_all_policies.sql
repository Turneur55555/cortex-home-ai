
-- SEC-4: Remplacer toutes les policies USING (true) par auth.uid() = created_by
DROP POLICY IF EXISTS historique_imports_select ON public.historique_imports;
DROP POLICY IF EXISTS historique_imports_insert ON public.historique_imports;
DROP POLICY IF EXISTS historique_imports_update ON public.historique_imports;
DROP POLICY IF EXISTS historique_imports_delete ON public.historique_imports;

CREATE POLICY historique_imports_select ON public.historique_imports
  FOR SELECT TO authenticated USING (auth.uid() = created_by);

CREATE POLICY historique_imports_insert ON public.historique_imports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY historique_imports_update ON public.historique_imports
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY historique_imports_delete ON public.historique_imports
  FOR DELETE TO authenticated USING (auth.uid() = created_by);
