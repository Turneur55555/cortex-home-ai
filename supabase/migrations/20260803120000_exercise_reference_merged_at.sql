-- Ajoute `exercise_reference.merged_at` : horodatage de la dernière fusion
-- reçue par une fiche CONSERVÉE (le pendant symétrique de `archived_at` /
-- `merged_into_id`, posés côté fiche archivée). Demandé pour que
-- l'administration puisse filtrer/compter les exercices "Fusionnés" par une
-- simple colonne, sans dépendre de `exercise_merge_log` (service_role
-- uniquement) — voir docs/architecture/exercises-dataset-integration.md §17.
--
-- Additif, nullable, rétro-compatible : NULL = jamais reçu de fusion.
ALTER TABLE public.exercise_reference
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

COMMENT ON COLUMN public.exercise_reference.merged_at IS
  'Horodatage de la dernière fusion reçue par cette fiche (elle est restée la fiche conservée) — NULL si jamais fusionnée. Posé par merge_exercise_references, restauré par undo_exercise_merge.';

-- CREATE OR REPLACE : reprend exactement le corps de la version précédente
-- (migration 20260731120000_exercise_library_admin.sql), seul l'ajout de
-- `merged_at = now()` dans l'UPDATE d'enrichissement change.
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

  UPDATE public.exercises SET exercise_reference_id = p_keep_id WHERE id = ANY(v_exercise_ids);
  UPDATE public.workout_segments SET exercise_id = p_keep_id WHERE id = ANY(v_segment_ids);
  UPDATE public.user_exercise_illustrations SET exercise_reference_id = p_keep_id WHERE id = ANY(v_illustration_ids);

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
    dataset_synced_at   = coalesce(k.dataset_synced_at, a.dataset_synced_at),
    merged_at           = now()
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

-- Idem pour l'annulation : restaure `merged_at` depuis l'état snapshotté
-- avant fusion (avait déjà `to_jsonb(er)` capturé toutes les colonnes,
-- merged_at y compris — seule la ligne de restauration explicite manquait).
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
    merged_at = (v_log.before_kept_state ->> 'merged_at')::timestamptz,
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

NOTIFY pgrst, 'reload schema';
