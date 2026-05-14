-- ============================================================
-- Suppression complète du système de free plan.
-- Toutes les limites d'usage disparaissent : chaque utilisateur
-- a accès illimité aux items, documents PDF, et aux fonctions IA.
-- ============================================================

-- 1. Limite de 50 items par module (free plan)
DROP TRIGGER  IF EXISTS check_free_plan_items     ON public.items;
DROP FUNCTION IF EXISTS public.enforce_free_plan_items();

-- 2. Limite de 10 documents PDF (free plan)
--    (déjà supprimée en 20260514000001 — idempotent)
DROP TRIGGER  IF EXISTS check_free_plan_documents ON public.documents;
DROP FUNCTION IF EXISTS public.enforce_free_plan_documents();

-- 3. Garde anti-upgrade premium en auto-update
--    (plus utile sans distinction de plan)
DROP TRIGGER  IF EXISTS prevent_premium_self_update_trigger ON public.users_profiles;
DROP FUNCTION IF EXISTS public.prevent_premium_self_update();

-- 4. Assouplir la politique INSERT sur users_profiles :
--    retirer la condition "premium = false" devenue sans objet.
DROP POLICY IF EXISTS "Users insert own profile" ON public.users_profiles;
CREATE POLICY "Users insert own profile"
  ON public.users_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
