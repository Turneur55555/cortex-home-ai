-- Sauvegarde/restauration ciblée pour l'import du dataset externe
-- hasaneyldrm/exercises-dataset (voir docs/architecture/exercises-dataset-integration.md §12).
-- Additif uniquement : ne touche aucune table existante, ne modifie aucune
-- donnée. Objectif : garantir qu'un import réel (dry_run:false) est
-- totalement réversible — avant toute écriture, l'edge function
-- import-exercises-dataset snapshotte l'intégralité des lignes
-- `exercise_reference` de la discipline concernée, puis journalise les
-- lignes créées, ce qui permet une restauration exacte via
-- `restore_exercise_reference_import(run_id)`.

-- 1) Un "run" = une exécution réelle de l'import (jamais un dry-run, qui
--    n'écrit rien et ne crée donc aucun run).
CREATE TABLE IF NOT EXISTS public.exercise_reference_import_runs (
  id                     uuid        PRIMARY KEY,
  dataset_source         text        NOT NULL,
  started_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  rolled_back_at         timestamptz,
  records_total          integer,
  records_auto_merged    integer,
  records_created        integer,
  records_queued_for_review integer,
  notes                  text
);

COMMENT ON TABLE public.exercise_reference_import_runs IS
  'Une ligne par exécution réelle (dry_run:false) de import-exercises-dataset. Jamais créée par un dry-run.';

-- 2) Sauvegarde complète de chaque ligne exercise_reference existante avant
--    qu'un run ne la touche potentiellement — snapshottée pour TOUTES les
--    lignes de la discipline importée, pas seulement celles qui finissent
--    fusionnées, afin de garantir une restauration exacte quel que soit le
--    résultat du matching.
CREATE TABLE IF NOT EXISTS public.exercise_reference_import_backup (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid        NOT NULL REFERENCES public.exercise_reference_import_runs(id) ON DELETE CASCADE,
  exercise_reference_id  uuid        NOT NULL,
  row_data               jsonb       NOT NULL,
  taken_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, exercise_reference_id)
);

CREATE INDEX IF NOT EXISTS exercise_reference_import_backup_run_idx
  ON public.exercise_reference_import_backup (run_id);

COMMENT ON TABLE public.exercise_reference_import_backup IS
  'Copie complète (row_data) de chaque ligne exercise_reference existante AVANT un run réel — permet une restauration exacte.';

-- 3) Journal des lignes créées par un run (jamais présentes avant) — nécessaire
--    pour qu'une restauration puisse les supprimer proprement (elles n'ont pas
--    d'état "avant" à restaurer, elles n'existaient simplement pas).
CREATE TABLE IF NOT EXISTS public.exercise_reference_import_created (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid        NOT NULL REFERENCES public.exercise_reference_import_runs(id) ON DELETE CASCADE,
  exercise_reference_id  uuid        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, exercise_reference_id)
);

CREATE INDEX IF NOT EXISTS exercise_reference_import_created_run_idx
  ON public.exercise_reference_import_created (run_id);

COMMENT ON TABLE public.exercise_reference_import_created IS
  'Lignes exercise_reference créées par un run réel — supprimées lors d''une restauration (voir restore_exercise_reference_import).';

ALTER TABLE public.exercise_reference_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_reference_import_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_reference_import_created ENABLE ROW LEVEL SECURITY;

-- Même choix que exercise_dataset_candidates (migration 20260728120000) :
-- aucun système de rôle admin n'existe encore côté Cortex, ces tables restent
-- donc service_role uniquement.
DROP POLICY IF EXISTS "exercise_reference_import_runs service_role all" ON public.exercise_reference_import_runs;
CREATE POLICY "exercise_reference_import_runs service_role all"
  ON public.exercise_reference_import_runs FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exercise_reference_import_backup service_role all" ON public.exercise_reference_import_backup;
CREATE POLICY "exercise_reference_import_backup service_role all"
  ON public.exercise_reference_import_backup FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exercise_reference_import_created service_role all" ON public.exercise_reference_import_created;
CREATE POLICY "exercise_reference_import_created service_role all"
  ON public.exercise_reference_import_created FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 4) Fonction de restauration exacte. SECURITY DEFINER pour pouvoir être
--    appelée via RPC service_role sans accorder de droits d'écriture directs
--    sur exercise_reference à un autre rôle. Deux actions, dans cet ordre :
--    a) supprime les lignes créées par ce run (jamais de FK cassée : toutes
--       les colonnes qui référencent exercise_reference depuis d'autres
--       tables sont ON DELETE SET NULL — voir exercise-central-architecture.md
--       §2.3/§2.5/§2.6 — donc aucune suppression en cascade de données
--       utilisateur, seulement une remise à NULL du lien d'identité) ;
--    b) restaure l'état exact (row_data) des lignes enrichies par ce run.
--    Ne touche jamais une ligne qui n'a pas été journalisée par CE run_id.
CREATE OR REPLACE FUNCTION public.restore_exercise_reference_import(p_run_id uuid)
RETURNS TABLE(restored_count integer, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored integer := 0;
  v_deleted  integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercise_reference_import_runs WHERE id = p_run_id) THEN
    RAISE EXCEPTION 'Aucun run d''import trouvé pour run_id=%', p_run_id;
  END IF;

  WITH deleted AS (
    DELETE FROM public.exercise_reference
    WHERE id IN (
      SELECT exercise_reference_id
      FROM public.exercise_reference_import_created
      WHERE run_id = p_run_id
    )
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  WITH restored AS (
    UPDATE public.exercise_reference er
    SET
      name                = (b.row_data ->> 'name'),
      category             = (b.row_data ->> 'category'),
      discipline_id        = (b.row_data ->> 'discipline_id'),
      description          = (b.row_data ->> 'description'),
      media                = (b.row_data -> 'media'),
      config               = (b.row_data -> 'config'),
      aliases              = CASE
                                WHEN b.row_data -> 'aliases' IS NULL
                                  OR b.row_data -> 'aliases' = 'null'::jsonb
                                THEN NULL
                                ELSE (
                                  SELECT array_agg(alias_value)
                                  FROM jsonb_array_elements_text(b.row_data -> 'aliases') AS alias_value
                                )
                              END,
      is_active            = COALESCE((b.row_data ->> 'is_active')::boolean, true),
      sort_order           = (b.row_data ->> 'sort_order')::integer,
      dataset_source       = (b.row_data ->> 'dataset_source'),
      dataset_exercise_id  = (b.row_data ->> 'dataset_exercise_id'),
      dataset_synced_at    = (b.row_data ->> 'dataset_synced_at')::timestamptz
    FROM public.exercise_reference_import_backup b
    WHERE b.run_id = p_run_id
      AND er.id = b.exercise_reference_id
    RETURNING er.id
  )
  SELECT count(*) INTO v_restored FROM restored;

  UPDATE public.exercise_reference_import_runs
  SET rolled_back_at = now()
  WHERE id = p_run_id;

  RETURN QUERY SELECT v_restored, v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_exercise_reference_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_exercise_reference_import(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
