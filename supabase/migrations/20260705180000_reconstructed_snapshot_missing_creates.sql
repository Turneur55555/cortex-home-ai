-- ⚠️ MIGRATION DE RECONSTRUCTION — PAS UNE MIGRATION HISTORIQUE ⚠️
--
-- Contexte (audit du 2026-07-05, reconstruction du dépôt supabase/migrations/) :
-- Les tables `activity_log`, `dossier_documents` et `taches_recurrentes` existent
-- en production mais leur `CREATE TABLE IF NOT EXISTS` d'origine est INTROUVABLE :
--   - absent des 120 migrations trackées dans supabase_migrations.schema_migrations
--   - absent des migrations locales non-trackées retrouvées dans le repo
-- Elles ne sont référencées qu'indirectement, via des migrations ULTÉRIEURES qui
-- leur ajoutent des policies RLS (ex. 20260605083019_sec1_rls_policies_missing_tables.sql,
-- 20260612153117_fix_indexes_and_duplicate_policies.sql), ce qui prouve qu'elles
-- existaient déjà à ce moment-là (avant le 5 juin 2026) sans qu'on sache par quel
-- mécanisme elles ont été créées (probablement Supabase Studio / éditeur SQL direct,
-- ou un outil tiers qui ne génère pas de fichier de migration).
--
-- CE FICHIER N'EST PAS UNE RECONSTITUTION HISTORIQUE FIDÈLE : c'est un instantané
-- (snapshot) de la structure ACTUELLE (2026-07-05) de ces 3 tables, au sens de
-- l'item 4 de la demande d'audit ("reconstruis le fichier SQL le plus fidèlement
-- possible à partir du schéma actuel [...] ajoute des commentaires lorsque
-- certaines parties ne peuvent pas être reconstituées avec certitude").
--
-- Limites connues (à ne pas perdre de vue) :
--   - Impossible de savoir si ces tables ont subi des ALTER intermédiaires depuis
--     leur création (colonnes ajoutées/supprimées) : ce snapshot capture uniquement
--     l'état final actuel, pas l'historique réel.
--   - Aucune policy RLS propre à ces 3 tables n'a été retrouvée au-delà de celles
--     déjà présentes dans 20260605083019/20260612153117 (déjà dans le repo) — RLS
--     n'est PAS ré-activé ici pour éviter un doublon avec ces migrations existantes.
--   - Le timestamp de ce fichier (20260705180000) est arbitraire (placé après la
--     dernière migration connue) : il ne reflète PAS la date réelle de création.
--
-- Sur une base rejouant l'intégralité des migrations du repo, cette migration
-- comble le seul vrai trou de couverture identifié par l'audit (cf. rapport
-- MIGRATION_AUDIT_REPORT.md) : sans elle, les migrations RLS ci-dessus
-- échoueraient faute de table cible.

CREATE TABLE IF NOT EXISTS public.activity_log (
  id          uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  text,
  user_name   text,
  table_name  text                     NOT NULL,
  record_id   text,
  action      text                     NOT NULL CHECK (action = ANY (ARRAY['INSERT','UPDATE','DELETE'])),
  old_data    jsonb,
  new_data    jsonb,
  diff        jsonb,
  description text,
  created_at  timestamptz              DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON public.activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_table_name_idx ON public.activity_log (table_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log (user_id);

CREATE TABLE IF NOT EXISTS public.dossier_documents (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id   uuid         REFERENCES public.dossiers(id) ON DELETE CASCADE,
  nom          text         NOT NULL,
  type_mime    text,
  taille       integer,
  storage_path text         NOT NULL,
  categorie    text         DEFAULT 'autre',
  created_at   timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossier_documents_dossier_id ON public.dossier_documents (dossier_id);

CREATE TABLE IF NOT EXISTS public.taches_recurrentes (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id           uuid         REFERENCES public.dossiers(id) ON DELETE SET NULL,
  titre                text         NOT NULL,
  description          text,
  categorie            text         NOT NULL DEFAULT 'autre',
  priorite             text         NOT NULL DEFAULT 'medium',
  assignee_id          uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  frequence            text         NOT NULL CHECK (frequence = ANY (ARRAY['quotidien','hebdomadaire','mensuel','trimestriel','annuel'])),
  jour_du_mois         integer      CHECK (jour_du_mois BETWEEN 1 AND 31),
  jour_de_semaine      integer      CHECK (jour_de_semaine BETWEEN 0 AND 6),
  mois_de_annee        integer      CHECK (mois_de_annee BETWEEN 1 AND 12),
  active               boolean      NOT NULL DEFAULT true,
  date_debut           date         NOT NULL DEFAULT CURRENT_DATE,
  date_fin             date,
  derniere_generation  timestamptz,
  created_at           timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taches_recurrentes_assignee_id ON public.taches_recurrentes (assignee_id);
CREATE INDEX IF NOT EXISTS idx_taches_recurrentes_dossier_id ON public.taches_recurrentes (dossier_id);
