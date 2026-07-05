
-- SEC-1: Policies RLS pour tables sans aucune policy
CREATE POLICY auth_all_activity_log ON public.activity_log
  FOR ALL TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY auth_all_dossier_documents ON public.dossier_documents
  FOR ALL TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY auth_all_taches_recurrentes ON public.taches_recurrentes
  FOR ALL TO authenticated USING (auth.role() = 'authenticated');
