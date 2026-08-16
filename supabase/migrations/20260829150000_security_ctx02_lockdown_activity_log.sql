-- SECURITY FIX — CTX-02 (audit du 16/08/2026) :
--
-- activity_log portait une seule policy ALL ("auth_all_activity_log") avec
-- pour condition auth.role() = 'authenticated' — une tautologie : cette
-- condition est vraie pour TOUT compte connecté, elle ne filtre rien (le
-- rôle est déjà garanti par la clause TO authenticated de la policy elle-
-- même). Conséquence : tout utilisateur Cortex pouvait lire l'intégralité
-- du journal d'audit (y compris old_data/new_data recopiés depuis les
-- tables RH/paie) et le modifier ou le supprimer.
--
-- activity_log n'est alimentée QUE par des triggers sur des tables du
-- domaine RH/paie (taches, dossiers, echeances, dsn — vérifié via
-- pg_trigger) et sa seule fonction d'écriture, log_table_activity(), est
-- SECURITY DEFINER : elle continue de fonctionner sans aucun GRANT client,
-- le verrouillage ci-dessous ne peut donc pas casser l'audit lui-même.

DROP POLICY IF EXISTS "auth_all_activity_log" ON public.activity_log;

DROP POLICY IF EXISTS "activity_log_select_paie_staff" ON public.activity_log;
CREATE POLICY "activity_log_select_paie_staff"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_paie_staff());

DROP POLICY IF EXISTS "Block direct insert on activity_log" ON public.activity_log;
CREATE POLICY "Block direct insert on activity_log"
  ON public.activity_log AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct update on activity_log" ON public.activity_log;
CREATE POLICY "Block direct update on activity_log"
  ON public.activity_log AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct delete on activity_log" ON public.activity_log;
CREATE POLICY "Block direct delete on activity_log"
  ON public.activity_log AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- GRANTs — retrait de TRUNCATE (non gouverné par RLS) et des privilèges
-- d'écriture désormais inutiles côté client (l'unique écrivain légitime,
-- log_table_activity(), est SECURITY DEFINER et n'a besoin d'aucun GRANT
-- de rôle client).
REVOKE TRUNCATE, INSERT, UPDATE, DELETE ON TABLE public.activity_log FROM authenticated;
REVOKE ALL ON TABLE public.activity_log FROM anon;
