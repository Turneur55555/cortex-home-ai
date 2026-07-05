-- 1. Index dupliqué
DROP INDEX IF EXISTS public.idx_histimports_dossier;

-- 2. Politiques permissives en double sur user_pdfs (on garde user_pdfs_*_own)
DROP POLICY IF EXISTS "Users select own pdfs" ON public.user_pdfs;
DROP POLICY IF EXISTS "Users insert own pdfs" ON public.user_pdfs;
DROP POLICY IF EXISTS "Users delete own pdfs" ON public.user_pdfs;

-- 3. Index manquants sur clés étrangères
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_cache_user_id ON public.ai_cache (user_id);
CREATE INDEX IF NOT EXISTS idx_dossier_documents_dossier_id ON public.dossier_documents (dossier_id);
CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON public.exercises (user_id);
CREATE INDEX IF NOT EXISTS idx_health_data_imports_user_id ON public.health_data_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_item_id ON public.shopping_list (item_id);
CREATE INDEX IF NOT EXISTS idx_taches_recurrentes_assignee_id ON public.taches_recurrentes (assignee_id);
CREATE INDEX IF NOT EXISTS idx_taches_recurrentes_dossier_id ON public.taches_recurrentes (dossier_id);
