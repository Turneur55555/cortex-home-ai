
-- SEC-3 bis : révoquer via PUBLIC (les fonctions héritent du grant PUBLIC par défaut)
REVOKE EXECUTE ON FUNCTION public._seed_home_categories_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_home_categories_for_me() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generer_taches_recurrentes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_table_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_home_categories() FROM PUBLIC;
