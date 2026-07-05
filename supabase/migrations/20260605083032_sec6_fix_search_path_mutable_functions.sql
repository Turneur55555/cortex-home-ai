
-- SEC-6: Fixer le search_path sur les fonctions exposées
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.cleanup_expired_cache() SET search_path = public;
ALTER FUNCTION public.touch_health_data_imports_updated_at() SET search_path = public;
ALTER FUNCTION public.log_table_activity() SET search_path = public;
ALTER FUNCTION public.generer_taches_recurrentes() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
