-- ═══════════════════════════════════════════════════════════════
-- CORRECTIF MINIMAL — Répare uniquement le signup
-- Coller dans : Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Créer la table users_profiles (INDISPENSABLE pour que le signup fonctionne)
CREATE TABLE IF NOT EXISTS public.users_profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  display_name text CHECK (
    display_name IS NULL
    OR (char_length(display_name) >= 3 AND char_length(display_name) <= 20)
  )
);

ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Politiques RLS
DROP POLICY IF EXISTS "Users select own profile" ON public.users_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.users_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.users_profiles;

CREATE POLICY "Users select own profile" ON public.users_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.users_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.users_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. Fonction trigger (crée le profil automatiquement à l'inscription)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users_profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- 4. Trigger sur auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Vérification finale
SELECT 'users_profiles OK' AS status, count(*) AS rows FROM public.users_profiles;
