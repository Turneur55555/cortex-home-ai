-- Sécurité : fonctions SECURITY DEFINER internes non appelées par le front
-- (seuls ensure_home_categories_for_me et unlock_user_badge sont utilisés côté client)
REVOKE EXECUTE ON FUNCTION public._seed_home_categories_for_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_pdfs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_table_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generer_taches_recurrentes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_home_categories() FROM anon, authenticated;

-- Extension pg_trgm hors du schéma public
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
