
-- SEC-3: Révoquer l'accès anon aux fonctions SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public._seed_home_categories_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_pdfs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_home_categories_for_me() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generer_taches_recurrentes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_table_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_home_categories() FROM anon;
