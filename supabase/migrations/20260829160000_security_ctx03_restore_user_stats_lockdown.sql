-- SECURITY FIX — CTX-03 (audit du 16/08/2026) :
--
-- user_stats (XP/niveau de progression RPG) restait modifiable directement
-- par son propriétaire : PATCH /rest/v1/user_stats {"xp": 9999999} était
-- accepté (policy "Users manage own stats", PERMISSIVE, ALL,
-- auth.uid() = user_id — sans restriction sur INSERT/UPDATE/DELETE).
--
-- La migration 20260607103913_cf3ab5d8-e713-41b8-94a9-84e8ac475ef5.sql
-- créait déjà les 3 policies RESTRICTIVE ci-dessous pour bloquer
-- exactement ce comportement. Fait constaté en production (pas supposé) :
-- cette version est enregistrée APPLIED dans
-- supabase_migrations.schema_migrations, ET pourtant AUCUNE de ses policies
-- RESTRICTIVE n'existe sur user_stats, ET le GRANT EXECUTE retiré par cette
-- même migration sur public.compute_level_from_xp est toujours présent pour
-- anon/authenticated. Le suivi des migrations affirme donc un état que la
-- base ne reflète pas — cette migration réapplique directement l'état
-- attendu, sans dépendre de cet historique.
--
-- Le seul écrivain légitime reste public.award_character_xp() (SECURITY
-- DEFINER, appelé depuis les triggers de complétion de séance / les RPC de
-- récompense) — ces policies RESTRICTIVE ne s'appliquent qu'aux rôles
-- authenticated/anon, jamais au propriétaire de la fonction, le moteur XP
-- existant n'est donc pas affecté.

DROP POLICY IF EXISTS "Block direct insert on user_stats" ON public.user_stats;
CREATE POLICY "Block direct insert on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct update on user_stats" ON public.user_stats;
CREATE POLICY "Block direct update on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct delete on user_stats" ON public.user_stats;
CREATE POLICY "Block direct delete on user_stats"
  ON public.user_stats AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- Remise en cohérence du GRANT prévu par la même migration d'origine
-- (fonction pure, sans accès aux données — risque faible, mais l'écart
-- entre l'intention du dépôt et l'état réel doit être refermé partout où il
-- est constaté).
REVOKE EXECUTE ON FUNCTION public.compute_level_from_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_level_from_xp(integer) TO authenticated, service_role;
