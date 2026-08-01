-- Phase 6C : estimation Body Fat par photos corporelles standardisées.
--
-- Audit préalable (voir MEMORY.md) : la codebase a DÉJÀ un moteur vision
-- fonctionnel et réutilisable (Gemini 2.5 Flash, endpoint OpenAI-compatible,
-- `GEMINI_API_KEY`, pattern `image_url` en data-URI + tool-calling forcé —
-- utilisé par `scan-meal`/`scan-fridge`/`analyze-pdf`). Aucun nouveau
-- fournisseur externe n'est introduit ici. Un bucket Storage PRIVÉ dédié est
-- nécessaire : aucun bucket existant n'est sémantiquement approprié pour des
-- photos corporelles (`avatars` est PUBLIC — exclu d'office ; `exercise-images`/
-- `pdf-documents`/`health-images` sont un autre domaine).
--
-- Décision de conservation (§22 du brief) : les chemins Storage ne sont PAS
-- stockés directement dans `body_tracking` (qui reste "une mesure corporelle
-- datée", pas un gestionnaire de fichiers) — nouvelle table dédiée
-- `body_photo_analyses`, liée par FK à la ligne `body_tracking` qu'elle a
-- produite. `ON DELETE CASCADE` : supprimer la mesure supprime automatiquement
-- la ligne de métadonnées (les fichiers Storage eux-mêmes sont supprimés côté
-- client AVANT la suppression DB, voir `useDeleteBodyPhotoAnalysis`).
--
-- Le champ `body_fat_formula` de `body_tracking` (Phase 6B) est réutilisé
-- pour la version du moteur photo (`photo_body_fat_v1`) — c'est le même
-- concept ("comment cette estimation a été produite exactement"), pas une
-- resémantisation.

-- ---------------------------------------------------------------------
-- 1. Bucket Storage PRIVÉ dédié.
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('body-composition-photos', 'body-composition-photos', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg'];

-- Convention de chemin : {user_id}/{analysis_id}/{front|side|back}.jpg — le
-- segment [1] est TOUJOURS l'UUID de l'utilisateur propriétaire (vérifié par
-- ces 4 policies, pas seulement par le fait que le bucket soit privé — un
-- bucket privé seul ne suffit pas à isoler les utilisateurs entre eux, §5 du
-- brief Phase 6C).
DROP POLICY IF EXISTS "body_photos_select_own" ON storage.objects;
CREATE POLICY "body_photos_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'body-composition-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "body_photos_insert_own" ON storage.objects;
CREATE POLICY "body_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'body-composition-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "body_photos_update_own" ON storage.objects;
CREATE POLICY "body_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'body-composition-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "body_photos_delete_own" ON storage.objects;
CREATE POLICY "body_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'body-composition-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------
-- 2. Métadonnées d'analyse photo — jamais l'image elle-même, jamais l'URL
--    publique (le bucket est privé, l'accès passe toujours par une URL
--    signée générée à la demande côté client authentifié).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.body_photo_analyses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_tracking_id   uuid NOT NULL REFERENCES public.body_tracking(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Toujours 'success' en Phase 6C : une analyse 'insufficient_quality' ou
  -- 'failed' n'est JAMAIS persistée (§46 du brief — aucune mesure créée dans
  -- ces cas). Colonne conservée pour extensibilité future sans migration.
  status             text NOT NULL DEFAULT 'success',
  front_path         text NOT NULL,
  side_path          text NOT NULL,
  back_path          text,
  min_percent        double precision NOT NULL,
  max_percent        double precision NOT NULL,
  reference_percent  double precision NOT NULL,
  engine_version     text NOT NULL,
  warnings           text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.body_photo_analyses
  DROP CONSTRAINT IF EXISTS body_photo_analyses_status_check;
ALTER TABLE public.body_photo_analyses
  ADD CONSTRAINT body_photo_analyses_status_check
  CHECK (status IN ('success'));

ALTER TABLE public.body_photo_analyses
  DROP CONSTRAINT IF EXISTS body_photo_analyses_engine_version_check;
ALTER TABLE public.body_photo_analyses
  ADD CONSTRAINT body_photo_analyses_engine_version_check
  CHECK (engine_version IN ('photo_body_fat_v1'));

-- Mêmes bornes que `body_tracking_body_fat_check`/`_min_percent_check`/
-- `_max_percent_check` (1-70) — une seule définition de "Body Fat plausible".
ALTER TABLE public.body_photo_analyses
  DROP CONSTRAINT IF EXISTS body_photo_analyses_range_check;
ALTER TABLE public.body_photo_analyses
  ADD CONSTRAINT body_photo_analyses_range_check
  CHECK (
    min_percent >= 1 AND min_percent <= 70
    AND max_percent >= 1 AND max_percent <= 70
    AND min_percent <= max_percent
    AND reference_percent >= min_percent AND reference_percent <= max_percent
  );

ALTER TABLE public.body_photo_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own body photo analyses" ON public.body_photo_analyses;
CREATE POLICY "Users manage own body photo analyses" ON public.body_photo_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_body_photo_analyses_user_created
  ON public.body_photo_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_body_photo_analyses_body_tracking
  ON public.body_photo_analyses (body_tracking_id);

-- ---------------------------------------------------------------------
-- 3. Réutiliser `body_fat_formula` (Phase 6B) pour l'identifiant de version
--    du moteur photo — jamais une deuxième colonne pour le même concept.
-- ---------------------------------------------------------------------

ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_formula_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_formula_check
  CHECK (body_fat_formula IS NULL OR body_fat_formula IN ('navy_v1', 'photo_body_fat_v1'));

-- ---------------------------------------------------------------------
-- 4. Nouvelle action de rate limiting pour l'Edge Function d'estimation
--    photo (même convention que les autres appels IA — voir
--    20260804090000_rate_limits_action_check_missing_actions.sql).
-- ---------------------------------------------------------------------

ALTER TABLE public.rate_limits
  DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits
  ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image',
    'food_lookup', 'analyze_exercise', 'verify_exercise_rank',
    'estimate_body_fat_photo'
  ]));
