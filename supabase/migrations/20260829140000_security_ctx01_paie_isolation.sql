-- SECURITY FIX — CTX-01 (audit du 16/08/2026, source de vérité = état réel
-- de la base, pas le dépôt) :
--
-- is_paie_staff() autorisait tout utilisateur possédant une ligne dans
-- public.profiles, et public.handle_new_user() (trigger AFTER INSERT sur
-- auth.users, migration 20260521203001) crée cette ligne pour CHAQUE
-- inscription — y compris les inscriptions Cortex, qui n'ont rien à voir
-- avec le domaine RH/paie (tachepaie) hébergé dans le même projet Supabase.
-- profiles.role avait pour DEFAULT 'gestionnaire' (rôle le plus privilégié,
-- CHECK (role IN ('admin','gestionnaire','consultant')) — aucune valeur non
-- privilégiée n'existait dans le modèle). Résultat : toute nouvelle
-- inscription Cortex obtenait un accès lecture/écriture complet aux 18
-- tables RH/paie (contrats, DSN, arrêts maladie...) via is_paie_staff(),
-- utilisée par la quasi-totalité des policies de ce domaine.
--
-- Preuve d'exploitation avant correctif : un compte Cortex fraîchement créé
-- pouvait faire GET /rest/v1/arrets_maladie?select=* et obtenir un résultat
-- non filtré.
--
-- Correctif en deux temps, sans toucher à AUCUNE ligne existante de
-- profiles :
--   1. Ajout d'une valeur non privilégiée 'none' au CHECK existant, et
--      DEFAULT profiles.role → 'none'. Les 3 lignes déjà présentes gardent
--      leur valeur actuelle inchangée.
--   2. is_paie_staff() vérifie désormais explicitement role IN
--      ('admin','gestionnaire','consultant') au lieu de la simple existence
--      de la ligne.
--   3. La colonne role est verrouillée en écriture cliente (REVOKE UPDATE
--      sur cette seule colonne) : sans cela, un utilisateur pourrait
--      s'auto-attribuer 'gestionnaire' via PATCH /rest/v1/profiles et
--      annuler le correctif en une requête (aucun code applicatif Cortex ne
--      lit ni n'écrit la table profiles — vérifié, aucune régression
--      possible côté client).
--   4. Durcissement des GRANTs : TRUNCATE n'est PAS filtré par RLS en
--      Postgres (contrairement à SELECT/INSERT/UPDATE/DELETE) — retiré pour
--      anon/authenticated sur l'ensemble du domaine RH/paie, qui n'en a
--      structurellement aucun besoin depuis le client.
--
-- ⚠️ POINT NON RÉSOLU — décision métier nécessitant un humain :
-- Cet audit n'a pas pu lire auth.users (accès refusé par la politique de
-- l'environnement d'audit) pour confirmer que les 3 lignes actuelles de
-- profiles.role='gestionnaire' correspondent bien à des comptes RH
-- légitimes plutôt qu'à d'anciennes inscriptions Cortex ayant hérité du même
-- défaut avant ce correctif. Cette migration NE MODIFIE AUCUNE ligne
-- existante — à vérifier manuellement (Authentication → Users, croisé avec
-- `SELECT id, email, role FROM public.profiles`).

-- 1) Étendre le CHECK existant avec une valeur non privilégiée, DEFAULT.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'gestionnaire'::text, 'consultant'::text, 'none'::text]));
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'none';

-- 2) is_paie_staff() : existence de ligne → rôle explicitement privilégié.
CREATE OR REPLACE FUNCTION public.is_paie_staff()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'gestionnaire', 'consultant')
  );
$$;

-- 3) Verrouillage de la colonne role — seul service_role peut la modifier.
REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon;

-- 4) GRANTs — retrait de TRUNCATE (non gouverné par RLS) sur tout le
--    domaine RH/paie pour anon/authenticated.
REVOKE TRUNCATE ON TABLE public.profiles FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.affiliations_mutuelle FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.app_settings FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.arrets_maladie FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.ca_praticiens FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.contrats FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.controle_lignes FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.cp_controles FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.cp_historique FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.dossiers FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.dossier_documents FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.dsn FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.echeances FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.historique_imports FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.imports FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.regles_analyse FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.silae_sync_logs FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.stc FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.taches FROM authenticated, anon;
REVOKE TRUNCATE ON TABLE public.taches_recurrentes FROM authenticated, anon;
