-- SECURITY FIX — correctif de 20260829140000 (CTX-01), constaté par
-- vérification directe de production après application (audit du
-- 16/08/2026) : `REVOKE UPDATE (role) ON public.profiles FROM
-- authenticated, anon` n'a AUCUN effet quand ces rôles possèdent déjà un
-- GRANT UPDATE au niveau de la TABLE ENTIÈRE (pg_class.relacl) — c'était le
-- cas ici (INSERT,SELECT,UPDATE,DELETE,REFERENCES,TRIGGER accordés sur
-- toute la table). Un REVOKE colonne (pg_attribute.attacl) ne peut pas
-- retirer un privilège déjà accordé au niveau table ; Postgres autorise
-- l'UPDATE dès que L'UN des deux ACL (table OU colonne) le permet. Un
-- utilisateur Cortex normal pouvait donc toujours faire
-- PATCH /rest/v1/profiles {"role":"gestionnaire"} malgré la migration
-- précédente — vérifié via information_schema.column_privileges après coup,
-- pas supposé.
--
-- Correction : retirer le GRANT UPDATE au niveau table, puis le redonner
-- explicitement colonne par colonne, sans jamais inclure `role` (ni `id`).
-- anon ne peut de toute façon jamais satisfaire profiles_update_own
-- (USING auth.uid() = id — auth.uid() est NULL pour anon) : aucun GRANT
-- UPDATE ne lui est redonné.

REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon;
GRANT UPDATE (email, full_name, avatar_url) ON public.profiles TO authenticated;
