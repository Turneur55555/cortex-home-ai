-- Bibliothèque d'exercices — administration, multi-média, variantes, fusion
-- manuelle (demandé par Nathan, voir docs/architecture/exercises-dataset-integration.md §14).
-- Additif uniquement. Principe fondamental : Cortex reste la source de vérité,
-- le dataset externe n'enrichit que sur décision manuelle explicite — AUCUNE
-- fusion automatique n'est jamais déclenchée par ce schéma, il ne fait que la
-- rendre possible et réversible depuis une interface d'administration.

-- 1) Familles d'exercices ("Développé couché" -> barre/haltères/incliné/...).
--    Les variantes RESTENT des exercice_reference indépendants ; family_id ne
--    fait que les relier pour la navigation, jamais pour le calcul d'identité
--    (exercise_reference reste l'unique référentiel, voir
--    exercise-central-architecture.md §12.1 — une famille n'est qu'un
--    regroupement d'affichage, pas une nouvelle notion d'identité).
CREATE TABLE IF NOT EXISTS public.exercise_families (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  category      text,
  discipline_id text        NOT NULL DEFAULT 'muscu',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discipline_id, name)
);

ALTER TABLE public.exercise_reference
  ADD COLUMN IF NOT EXISTS family_id      uuid REFERENCES public.exercise_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.exercise_reference(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exercise_reference_family_id_idx ON public.exercise_reference (family_id);

COMMENT ON COLUMN public.exercise_reference.archived_at IS
  'Non NULL = exercice archivé (soft delete, jamais une suppression physique) — via archivage manuel ou fusion (voir merged_into_id).';
COMMENT ON COLUMN public.exercise_reference.merged_into_id IS
  'Si non NULL, cet exercice a été archivé suite à une fusion manuelle : pointe vers la ligne exercise_reference conservée. Jamais posé automatiquement.';

-- 2) Médias multiples par exercice (photos, GIF, vidéos) — remplace la
--    limitation "une seule image" du jsonb `media` existant, qui reste en
--    place tel quel (résumé/legacy) et n'est jamais lu ni écrit par le code
--    ci-dessous : cette table est la nouvelle source pour tout affichage
--    multi-média.
CREATE TABLE IF NOT EXISTS public.exercise_media (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_reference_id uuid        NOT NULL REFERENCES public.exercise_reference(id) ON DELETE CASCADE,
  media_type            text        NOT NULL CHECK (media_type IN ('image', 'gif', 'video')),
  url                   text,
  storage_path          text,
  source                text        NOT NULL DEFAULT 'cortex' CHECK (source IN ('cortex', 'dataset')),
  attribution           text,
  is_primary            boolean     NOT NULL DEFAULT false,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS exercise_media_exercise_idx ON public.exercise_media (exercise_reference_id, media_type, sort_order);

-- Un seul média "principal" par type et par exercice (photo principale, GIF
-- principal) — appliqué par contrainte plutôt que par convention applicative.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_media_one_primary_per_type_idx
  ON public.exercise_media (exercise_reference_id, media_type)
  WHERE is_primary;

ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_families ENABLE ROW LEVEL SECURITY;

-- Lecture publique (comme exercise_reference lui-même) : les médias
-- illustrent un référentiel déjà lisible par tous les utilisateurs
-- authentifiés. Écriture réservée à service_role (mêmes raisons que
-- exercise_reference — pas de rôle admin dédié aujourd'hui, voir §12).
DROP POLICY IF EXISTS "exercise_media readable by everyone" ON public.exercise_media;
CREATE POLICY "exercise_media readable by everyone"
  ON public.exercise_media FOR SELECT USING (true);
DROP POLICY IF EXISTS "exercise_media service_role write" ON public.exercise_media;
CREATE POLICY "exercise_media service_role write"
  ON public.exercise_media FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exercise_families readable by everyone" ON public.exercise_families;
CREATE POLICY "exercise_families readable by everyone"
  ON public.exercise_families FOR SELECT USING (true);
DROP POLICY IF EXISTS "exercise_families service_role write" ON public.exercise_families;
CREATE POLICY "exercise_families service_role write"
  ON public.exercise_families FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Suggestions de similarité entre DEUX exercise_reference — jamais
--    appliquées automatiquement, uniquement affichées dans l'interface
--    d'administration pour une décision manuelle (fusionner / ignorer).
--    Contrainte d'ordre (exercise_id_a < exercise_id_b) pour qu'une paire ne
--    soit jamais dupliquée dans les deux sens.
CREATE TABLE IF NOT EXISTS public.exercise_similarity_pairs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id_a  uuid        NOT NULL REFERENCES public.exercise_reference(id) ON DELETE CASCADE,
  exercise_id_b  uuid        NOT NULL REFERENCES public.exercise_reference(id) ON DELETE CASCADE,
  score          numeric     NOT NULL,
  reasons        jsonb,
  status         text        NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'dismissed', 'merged')),
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (exercise_id_a < exercise_id_b),
  UNIQUE (exercise_id_a, exercise_id_b)
);

CREATE INDEX IF NOT EXISTS exercise_similarity_pairs_a_idx ON public.exercise_similarity_pairs (exercise_id_a, status);
CREATE INDEX IF NOT EXISTS exercise_similarity_pairs_b_idx ON public.exercise_similarity_pairs (exercise_id_b, status);
CREATE INDEX IF NOT EXISTS exercise_similarity_pairs_score_idx ON public.exercise_similarity_pairs (score DESC);

ALTER TABLE public.exercise_similarity_pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_similarity_pairs service_role all" ON public.exercise_similarity_pairs;
CREATE POLICY "exercise_similarity_pairs service_role all"
  ON public.exercise_similarity_pairs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Journal des fusions manuelles — permet une restauration complète
--    (voir fonction undo_exercise_merge ci-dessous). Enregistre précisément
--    quelles lignes ont été déplacées pour ne jamais annuler plus que ce
--    qu'une fusion donnée a réellement touché.
CREATE TABLE IF NOT EXISTS public.exercise_merge_log (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_exercise_id            uuid        NOT NULL,
  archived_exercise_id        uuid        NOT NULL,
  before_kept_state           jsonb       NOT NULL,
  before_archived_state       jsonb       NOT NULL,
  affected_exercise_ids       uuid[]      NOT NULL DEFAULT '{}',
  affected_workout_segment_ids uuid[]     NOT NULL DEFAULT '{}',
  affected_illustration_ids   uuid[]      NOT NULL DEFAULT '{}',
  affected_media_ids          uuid[]      NOT NULL DEFAULT '{}',
  performed_at                timestamptz NOT NULL DEFAULT now(),
  performed_by                uuid,
  undone_at                   timestamptz,
  notes                       text
);

CREATE INDEX IF NOT EXISTS exercise_merge_log_kept_idx ON public.exercise_merge_log (kept_exercise_id);
CREATE INDEX IF NOT EXISTS exercise_merge_log_archived_idx ON public.exercise_merge_log (archived_exercise_id);

ALTER TABLE public.exercise_merge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_merge_log service_role all" ON public.exercise_merge_log;
CREATE POLICY "exercise_merge_log service_role all"
  ON public.exercise_merge_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Fonction de fusion manuelle. SECURITY DEFINER, appelée uniquement par
--    l'edge function admin-exercise-actions (jamais directement par un
--    client, jamais automatiquement). Conserve TOUJOURS l'identité et
--    l'historique de la ligne conservée (p_keep_id) : aucune séance, série,
--    répétition, charge, record ou statistique n'est perdue — les lignes
--    d'autres tables qui pointaient vers p_archive_id sont REPOINTÉES vers
--    p_keep_id (pas mises à NULL comme lors d'un rollback d'import), pour
--    que l'historique de l'exercice archivé continue de compter dans les
--    statistiques de l'exercice conservé.
CREATE OR REPLACE FUNCTION public.merge_exercise_references(p_keep_id uuid, p_archive_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep_before   jsonb;
  v_archive_before jsonb;
  v_exercise_ids  uuid[];
  v_segment_ids   uuid[];
  v_illustration_ids uuid[];
  v_media_ids     uuid[];
  v_log_id        uuid;
BEGIN
  IF p_keep_id = p_archive_id THEN
    RAISE EXCEPTION 'Impossible de fusionner un exercice avec lui-même';
  END IF;

  SELECT to_jsonb(er) INTO v_keep_before FROM public.exercise_reference er WHERE id = p_keep_id;
  SELECT to_jsonb(er) INTO v_archive_before FROM public.exercise_reference er WHERE id = p_archive_id;
  IF v_keep_before IS NULL OR v_archive_before IS NULL THEN
    RAISE EXCEPTION 'Exercice introuvable (keep=%, archive=%)', p_keep_id, p_archive_id;
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_exercise_ids FROM public.exercises WHERE exercise_reference_id = p_archive_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_segment_ids FROM public.workout_segments WHERE exercise_id = p_archive_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_illustration_ids FROM public.user_exercise_illustrations WHERE exercise_reference_id = p_archive_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_media_ids FROM public.exercise_media WHERE exercise_reference_id = p_archive_id;

  -- Repointe toutes les références vers la ligne conservée — aucune donnée
  -- utilisateur perdue, l'historique de l'exercice archivé compte désormais
  -- sous l'identité conservée.
  UPDATE public.exercises SET exercise_reference_id = p_keep_id WHERE id = ANY(v_exercise_ids);
  UPDATE public.workout_segments SET exercise_id = p_keep_id WHERE id = ANY(v_segment_ids);
  UPDATE public.user_exercise_illustrations SET exercise_reference_id = p_keep_id WHERE id = ANY(v_illustration_ids);

  -- Déplace les médias de l'exercice archivé vers celui conservé. Si la
  -- ligne conservée a déjà un média principal de ce type, le média déplacé
  -- n'est pas promu principal (évite de violer la contrainte d'unicité et de
  -- remplacer silencieusement un choix déjà fait par Nathan).
  UPDATE public.exercise_media m
  SET exercise_reference_id = p_keep_id,
      is_primary = CASE
        WHEN m.is_primary AND EXISTS (
          SELECT 1 FROM public.exercise_media k
          WHERE k.exercise_reference_id = p_keep_id AND k.media_type = m.media_type AND k.is_primary
        ) THEN false
        ELSE m.is_primary
      END
  WHERE m.id = ANY(v_media_ids);

  -- Enrichissement additif de la fiche conservée : ne remplace jamais une
  -- valeur déjà présente, uniquement les champs NULL, et fusionne les alias
  -- (union, jamais un remplacement) — même principe que l'import (voir
  -- import-exercises-dataset).
  UPDATE public.exercise_reference k
  SET
    description = coalesce(k.description, a.description),
    media       = coalesce(k.media, a.media),
    config      = coalesce(k.config, a.config),
    category    = coalesce(k.category, a.category),
    aliases     = (
      SELECT array_agg(DISTINCT alias)
      FROM unnest(coalesce(k.aliases, '{}') || coalesce(a.aliases, '{}') || ARRAY[a.name]) AS alias
    ),
    dataset_source      = coalesce(k.dataset_source, a.dataset_source),
    dataset_exercise_id = coalesce(k.dataset_exercise_id, a.dataset_exercise_id),
    dataset_synced_at   = coalesce(k.dataset_synced_at, a.dataset_synced_at)
  FROM public.exercise_reference a
  WHERE k.id = p_keep_id AND a.id = p_archive_id;

  UPDATE public.exercise_reference
  SET is_active = false, archived_at = now(), merged_into_id = p_keep_id
  WHERE id = p_archive_id;

  UPDATE public.exercise_similarity_pairs
  SET status = 'merged'
  WHERE (exercise_id_a = LEAST(p_keep_id, p_archive_id) AND exercise_id_b = GREATEST(p_keep_id, p_archive_id));

  INSERT INTO public.exercise_merge_log (
    kept_exercise_id, archived_exercise_id, before_kept_state, before_archived_state,
    affected_exercise_ids, affected_workout_segment_ids, affected_illustration_ids, affected_media_ids
  ) VALUES (
    p_keep_id, p_archive_id, v_keep_before, v_archive_before,
    v_exercise_ids, v_segment_ids, v_illustration_ids, v_media_ids
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_exercise_references(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_exercise_references(uuid, uuid) TO service_role;

-- 6) Annulation exacte d'une fusion — restaure les DEUX lignes exercise_reference
--    à leur état exact d'avant fusion et ne redéplace QUE les lignes
--    précisément journalisées par CETTE fusion (jamais une ligne modifiée
--    par une activité ultérieure sans rapport).
CREATE OR REPLACE FUNCTION public.undo_exercise_merge(p_merge_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log record;
BEGIN
  SELECT * INTO v_log FROM public.exercise_merge_log WHERE id = p_merge_log_id;
  IF v_log IS NULL THEN
    RAISE EXCEPTION 'Journal de fusion introuvable: %', p_merge_log_id;
  END IF;
  IF v_log.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette fusion a déjà été annulée le %', v_log.undone_at;
  END IF;

  UPDATE public.exercises SET exercise_reference_id = v_log.archived_exercise_id
  WHERE id = ANY(v_log.affected_exercise_ids);
  UPDATE public.workout_segments SET exercise_id = v_log.archived_exercise_id
  WHERE id = ANY(v_log.affected_workout_segment_ids);
  UPDATE public.user_exercise_illustrations SET exercise_reference_id = v_log.archived_exercise_id
  WHERE id = ANY(v_log.affected_illustration_ids);
  UPDATE public.exercise_media SET exercise_reference_id = v_log.archived_exercise_id
  WHERE id = ANY(v_log.affected_media_ids);

  UPDATE public.exercise_reference er
  SET
    name = v_log.before_kept_state ->> 'name',
    category = v_log.before_kept_state ->> 'category',
    description = v_log.before_kept_state ->> 'description',
    media = v_log.before_kept_state -> 'media',
    config = v_log.before_kept_state -> 'config',
    aliases = CASE
                WHEN v_log.before_kept_state -> 'aliases' IS NULL OR v_log.before_kept_state -> 'aliases' = 'null'::jsonb
                THEN NULL
                ELSE (SELECT array_agg(x) FROM jsonb_array_elements_text(v_log.before_kept_state -> 'aliases') x)
              END,
    dataset_source = v_log.before_kept_state ->> 'dataset_source',
    dataset_exercise_id = v_log.before_kept_state ->> 'dataset_exercise_id',
    dataset_synced_at = (v_log.before_kept_state ->> 'dataset_synced_at')::timestamptz,
    is_active = coalesce((v_log.before_kept_state ->> 'is_active')::boolean, true),
    archived_at = (v_log.before_kept_state ->> 'archived_at')::timestamptz,
    merged_into_id = (v_log.before_kept_state ->> 'merged_into_id')::uuid
  WHERE er.id = v_log.kept_exercise_id;

  UPDATE public.exercise_reference er
  SET
    is_active = coalesce((v_log.before_archived_state ->> 'is_active')::boolean, true),
    archived_at = (v_log.before_archived_state ->> 'archived_at')::timestamptz,
    merged_into_id = (v_log.before_archived_state ->> 'merged_into_id')::uuid
  WHERE er.id = v_log.archived_exercise_id;

  UPDATE public.exercise_similarity_pairs
  SET status = 'suggested'
  WHERE (exercise_id_a = LEAST(v_log.kept_exercise_id, v_log.archived_exercise_id)
     AND exercise_id_b = GREATEST(v_log.kept_exercise_id, v_log.archived_exercise_id))
    AND status = 'merged';

  UPDATE public.exercise_merge_log SET undone_at = now() WHERE id = p_merge_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_exercise_merge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_exercise_merge(uuid) TO service_role;

-- 7) Archivage / restauration autonomes (hors fusion) — toujours réversibles,
--    jamais une suppression physique.
CREATE OR REPLACE FUNCTION public.archive_exercise_reference(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.exercise_reference SET is_active = false, archived_at = now() WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.archive_exercise_reference(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_exercise_reference(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_exercise_reference(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exercise_reference WHERE id = p_id AND merged_into_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cet exercice a été archivé par fusion — utiliser undo_exercise_merge pour le restaurer, pas restore_exercise_reference';
  END IF;
  UPDATE public.exercise_reference SET is_active = true, archived_at = NULL WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_exercise_reference(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_exercise_reference(uuid) TO service_role;

-- 8) Suppression physique — UNIQUEMENT si l'exercice n'est référencé nulle
--    part. Ne supprime jamais une donnée utilisateur : si une référence
--    existe, ne fait rien et retourne false (l'appelant doit proposer une
--    fusion/remplacement, jamais forcer la suppression).
CREATE OR REPLACE FUNCTION public.delete_exercise_reference_if_unused(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_use boolean;
BEGIN
  SELECT
    EXISTS(SELECT 1 FROM public.exercises WHERE exercise_reference_id = p_id)
    OR EXISTS(SELECT 1 FROM public.workout_segments WHERE exercise_id = p_id)
    OR EXISTS(SELECT 1 FROM public.user_exercise_illustrations WHERE exercise_reference_id = p_id)
    OR EXISTS(SELECT 1 FROM public.exercise_reference WHERE merged_into_id = p_id)
  INTO v_in_use;

  IF v_in_use THEN
    RETURN false;
  END IF;

  DELETE FROM public.exercise_media WHERE exercise_reference_id = p_id;
  DELETE FROM public.exercise_similarity_pairs WHERE exercise_id_a = p_id OR exercise_id_b = p_id;
  DELETE FROM public.exercise_reference WHERE id = p_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_exercise_reference_if_unused(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_exercise_reference_if_unused(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
