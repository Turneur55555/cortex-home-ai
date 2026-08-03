-- Phase 10 §1 : 21 mesures body_tracking historiques ont un body_fat non
-- nul mais body_fat_method NULL (saisies avant que le choix de méthode ne
-- soit ajouté à l'UI, ou saisies sans que l'utilisateur clique une puce de
-- méthode — voir fix CorpsTab.tsx/BodyHistorySheet.tsx dans cette même
-- phase). `selectBodyCompositionForNutrition` (bodyCompositionForNutrition.ts)
-- ignore purement et simplement tout candidat dont la méthode est inconnue
-- (`isKnownBodyFatMethod`), rendant ces mesures invisibles pour Masse
-- grasse/Masse maigre malgré des données réelles.
--
-- Correction : `body_fat_method = 'manual'` — PAS une méthode précise
-- inventée (jamais 'measurements'/'dexa'/'bioimpedance'/'photo_estimate'
-- pour une donnée dont Cortex ne connaît pas la provenance réelle).
-- 'manual' a DÉJÀ cette sémantique exacte dans bodyComposition.ts :
-- « Cortex ne connaît PAS la provenance réelle du chiffre saisi » →
-- confiance "low" par construction (BODY_FAT_METHOD_CONFIDENCE.manual).
-- Aucune valeur perdue : seule la colonne method est renseignée, jamais
-- body_fat/weight/date.
UPDATE public.body_tracking
SET body_fat_method = 'manual'
WHERE body_fat_method IS NULL AND body_fat IS NOT NULL;

-- Phase 10 §5/§6/§7 : Cortex doit permettre une saisie manuelle native de
-- pas/FC repos/HRV, sans dépendance à un import Apple Health (jamais
-- utilisé par aucun compte). Réutilise `daily_activity` (déjà la table
-- "relevé d'activité daté par source", UNIQUE(user_id,date,source)) plutôt
-- qu'une nouvelle structure — une saisie manuelle devient simplement une
-- ligne avec `source = 'manual'`, coexistant proprement avec un futur
-- import 'apple_health' pour la même date (fusion faite en lecture, voir
-- lib/fitness/dailyActivity.ts).
ALTER TABLE public.daily_activity
  ADD COLUMN IF NOT EXISTS hrv_ms integer;

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_hrv_ms_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_hrv_ms_check
  CHECK (hrv_ms IS NULL OR (hrv_ms > 0 AND hrv_ms <= 300));

-- Garde-fous de plausibilité jamais appliqués jusqu'ici (aucun CHECK
-- n'existait sur steps/resting_hr/avg_hr/max_hr) — ajoutés maintenant que
-- la saisie manuelle ouvre la porte à une saisie utilisateur directe.
ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_resting_hr_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_resting_hr_check
  CHECK (resting_hr IS NULL OR (resting_hr > 0 AND resting_hr <= 250));

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_avg_hr_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_avg_hr_check
  CHECK (avg_hr IS NULL OR (avg_hr > 0 AND avg_hr <= 250));

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_max_hr_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_max_hr_check
  CHECK (max_hr IS NULL OR (max_hr > 0 AND max_hr <= 250));

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_steps_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_steps_check
  CHECK (steps IS NULL OR (steps >= 0 AND steps <= 200000));

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_source_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_source_check
  CHECK (source = ANY (ARRAY['apple_health'::text, 'manual'::text]));
