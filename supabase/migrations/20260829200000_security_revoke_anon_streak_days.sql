-- SECURITY HARDENING — relevé par le Supabase advisor APRÈS les correctifs
-- CTX-04/05/07 (audit du 16/08/2026, vérification post-correction).
--
-- `get_user_streak_days()` était le dernier `SECURITY DEFINER` encore
-- exécutable par le rôle `anon`. Il n'est plus exploitable depuis le
-- correctif CTX-04 : la fonction appelle `compute_fitness_stats(auth.uid())`,
-- et pour un appelant anonyme `auth.uid()` vaut NULL, ce qui déclenche
-- désormais `RAISE EXCEPTION 'Accès refusé'` dans la fonction appelée.
--
-- On retire quand même le GRANT : une fonction de statistiques utilisateur
-- n'a aucune raison d'être joignable sans session, et la protection ne doit
-- pas dépendre uniquement du comportement d'une fonction imbriquée (défense
-- en profondeur — c'est exactement le motif « la garde est ailleurs » qui
-- avait rendu CTX-05 contournable).
REVOKE EXECUTE ON FUNCTION public.get_user_streak_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_streak_days() TO authenticated, service_role;
