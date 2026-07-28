-- Intégration non destructive du dataset externe hasaneyldrm/exercises-dataset.
-- Additive uniquement : aucune colonne existante modifiée/supprimée, aucune ligne
-- d'exercise_reference touchée par cette migration elle-même (le remplissage se
-- fait via l'edge function import-exercises-dataset, séparément, après revue).
-- Voir docs/architecture/exercises-dataset-integration.md pour la stratégie complète.

-- 1) Colonnes de liaison externe sur exercise_reference (référentiel unique
--    d'identité, voir docs/architecture/exercise-central-architecture.md §2.2).
--    Les colonnes descriptives (description/media/config/aliases) existent déjà
--    et étaient réservées à cet usage ("fiches détaillées, illustrations,
--    variantes") — aucune nouvelle colonne descriptive n'est nécessaire.
ALTER TABLE public.exercise_reference
  ADD COLUMN IF NOT EXISTS dataset_source text,
  ADD COLUMN IF NOT EXISTS dataset_exercise_id text,
  ADD COLUMN IF NOT EXISTS dataset_synced_at timestamptz;

-- Un exercice donné ne peut être lié qu'une fois à un enregistrement donné d'une
-- source de dataset donnée (empêche un double-import de créer deux liaisons pour
-- la même paire source/dataset_exercise_id). Partiel : ne contraint que les
-- lignes réellement liées à un dataset externe.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_reference_dataset_link_idx
  ON public.exercise_reference (dataset_source, dataset_exercise_id)
  WHERE dataset_exercise_id IS NOT NULL;

COMMENT ON COLUMN public.exercise_reference.dataset_source IS
  'Origine du dataset externe ayant enrichi/créé cette ligne (ex. ''hasaneyldrm/exercises-dataset''). NULL = exercice géré uniquement par Cortex.';
COMMENT ON COLUMN public.exercise_reference.dataset_exercise_id IS
  'Identifiant de l''enregistrement dans le dataset externe (`id` du JSON source). Sert uniquement de clé de traçabilité/anti-doublon, jamais de clé métier.';
COMMENT ON COLUMN public.exercise_reference.dataset_synced_at IS
  'Horodatage de la dernière synchronisation d''enrichissement depuis le dataset externe.';

-- 2) File de revue pour les correspondances incertaines. Aucune fusion
--    automatique n'a lieu pour ces lignes tant qu'un statut ''pending'' n'a
--    pas été traité manuellement (approved -> enrichit exercise_reference,
--    rejected -> ignoré, created_new -> nouvelle ligne exercise_reference).
CREATE TABLE IF NOT EXISTS public.exercise_dataset_candidates (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_source              text        NOT NULL,
  dataset_exercise_id          text        NOT NULL,
  dataset_name                text        NOT NULL,
  dataset_payload              jsonb       NOT NULL,
  candidate_exercise_reference_id uuid     REFERENCES public.exercise_reference(id) ON DELETE SET NULL,
  match_score                 numeric,
  match_reasons                jsonb,
  status                      text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'auto_merged', 'created_new')),
  reviewed_by                 uuid,
  reviewed_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_source, dataset_exercise_id)
);

CREATE INDEX IF NOT EXISTS exercise_dataset_candidates_status_idx
  ON public.exercise_dataset_candidates (status);

COMMENT ON TABLE public.exercise_dataset_candidates IS
  'File de revue des correspondances incertaines entre le dataset externe et exercise_reference. Aucune ligne exercise_reference existante n''est modifiée tant que status reste ''pending''.';

ALTER TABLE public.exercise_dataset_candidates ENABLE ROW LEVEL SECURITY;

-- Aucun rôle "admin" n'existe encore dans Cortex (vérifié : pas de table
-- user_roles / fonction has_role au 2026-07-28). Cette file reste donc
-- service_role uniquement pour l'instant (traitée via l'edge function ou le
-- SQL editor Supabase) ; l'ouverture d'une UI de revue authentifiée est un
-- sujet séparé qui nécessitera un système de rôles (hors périmètre ici).
DROP POLICY IF EXISTS "exercise_dataset_candidates service_role all" ON public.exercise_dataset_candidates;
CREATE POLICY "exercise_dataset_candidates service_role all"
  ON public.exercise_dataset_candidates FOR ALL
  TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
