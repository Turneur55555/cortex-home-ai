-- Phase 4B : persistance de la stratégie calorique (objectif, rythme, mode
-- manuel/automatique) + historique des ajustements de calories.
--
-- `nutrition_goals` reste la table 1-ligne-par-utilisateur des objectifs
-- actifs (déjà utilisée pour calories/proteins/carbs/fats) — étendue avec :
--  - goal                    : catégorie métier stable (fat_loss/maintenance/
--                               muscle_gain), jamais un coefficient — même
--                               principe que metabolic_profile.activity_level
--                               (migration 20260806090000).
--  - target_rate              : catégorie métier stable (slow/moderate/fast),
--                               contrainte aux rythmes réellement supportés
--                               par objectif (voir lib/fitness/calorieStrategy.ts
--                               CALORIE_STRATEGY_RATES) — jamais un
--                               coefficient numérique persisté.
--  - calorie_strategy_mode    : manual (défaut) | automatic. JAMAIS activé
--                               automatiquement par cette migration — tout
--                               utilisateur (existant ou nouveau) démarre en
--                               manual.
--  - last_auto_adjustment_at  : horodatage du dernier ajustement AUTOMATIQUE
--                               uniquement (jamais mis à jour par un
--                               `manual_apply`) — base du cooldown (voir
--                               calorieStrategy.ts AUTO_ADJUSTMENT_COOLDOWN_DAYS).
--
-- `calorie_goal_adjustments` : nouvelle table d'historique (justifiée — vraie
-- traçabilité temporelle, pas une simple préférence utilisateur) de chaque
-- modification RÉELLEMENT APPLIQUÉE de `nutrition_goals.calories` (manuelle
-- validée ou automatique) — jamais les simples recommandations non
-- appliquées.
--
-- Aucune perte des objectifs existants : ALTER TABLE ... ADD COLUMN (pas de
-- DROP/recreate), toutes les nouvelles colonnes NULLABLE sauf
-- `calorie_strategy_mode` (NOT NULL DEFAULT 'manual', donc rétrocompatible
-- pour les lignes existantes). `calories`/`proteins`/`carbs`/`fats`/RLS
-- existante non touchés.

ALTER TABLE public.nutrition_goals
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS target_rate text,
  ADD COLUMN IF NOT EXISTS calorie_strategy_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_auto_adjustment_at timestamptz;

ALTER TABLE public.nutrition_goals
  DROP CONSTRAINT IF EXISTS nutrition_goals_goal_check;
ALTER TABLE public.nutrition_goals
  ADD CONSTRAINT nutrition_goals_goal_check
  CHECK (goal IS NULL OR goal IN ('fat_loss', 'maintenance', 'muscle_gain'));

-- Rythmes réellement supportés par objectif (voir CALORIE_STRATEGY_RATES) :
-- 'fast' n'existe que pour fat_loss ; muscle_gain n'a pas de 'fast' (surplus
-- volontairement plus conservateur, voir calorieStrategy.ts) ; maintenance
-- n'a aucun rythme (target_rate doit rester NULL).
ALTER TABLE public.nutrition_goals
  DROP CONSTRAINT IF EXISTS nutrition_goals_target_rate_check;
ALTER TABLE public.nutrition_goals
  ADD CONSTRAINT nutrition_goals_target_rate_check
  CHECK (
    target_rate IS NULL
    OR (goal = 'fat_loss' AND target_rate IN ('slow', 'moderate', 'fast'))
    OR (goal = 'muscle_gain' AND target_rate IN ('slow', 'moderate'))
  );

ALTER TABLE public.nutrition_goals
  DROP CONSTRAINT IF EXISTS nutrition_goals_calorie_strategy_mode_check;
ALTER TABLE public.nutrition_goals
  ADD CONSTRAINT nutrition_goals_calorie_strategy_mode_check
  CHECK (calorie_strategy_mode IN ('manual', 'automatic'));

-- ---------------------------------------------------------------------
-- Historique des ajustements de calories (manuel validé + automatique).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calorie_goal_adjustments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  mode                 text NOT NULL,
  previous_calories    integer,
  recommended_calories integer,
  applied_calories     integer NOT NULL,
  goal                 text,
  target_rate          text,
  reference_tdee_kcal  integer,
  reference_source     text,
  reason               text
);

ALTER TABLE public.calorie_goal_adjustments
  DROP CONSTRAINT IF EXISTS calorie_goal_adjustments_mode_check;
ALTER TABLE public.calorie_goal_adjustments
  ADD CONSTRAINT calorie_goal_adjustments_mode_check
  CHECK (mode IN ('manual_apply', 'automatic'));

ALTER TABLE public.calorie_goal_adjustments
  DROP CONSTRAINT IF EXISTS calorie_goal_adjustments_goal_check;
ALTER TABLE public.calorie_goal_adjustments
  ADD CONSTRAINT calorie_goal_adjustments_goal_check
  CHECK (goal IS NULL OR goal IN ('fat_loss', 'maintenance', 'muscle_gain'));

ALTER TABLE public.calorie_goal_adjustments
  DROP CONSTRAINT IF EXISTS calorie_goal_adjustments_target_rate_check;
ALTER TABLE public.calorie_goal_adjustments
  ADD CONSTRAINT calorie_goal_adjustments_target_rate_check
  CHECK (target_rate IS NULL OR target_rate IN ('slow', 'moderate', 'fast'));

ALTER TABLE public.calorie_goal_adjustments
  DROP CONSTRAINT IF EXISTS calorie_goal_adjustments_reference_source_check;
ALTER TABLE public.calorie_goal_adjustments
  ADD CONSTRAINT calorie_goal_adjustments_reference_source_check
  CHECK (reference_source IS NULL OR reference_source IN ('adaptive', 'modeled'));

ALTER TABLE public.calorie_goal_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own calorie goal adjustments" ON public.calorie_goal_adjustments;
CREATE POLICY "Users manage own calorie goal adjustments" ON public.calorie_goal_adjustments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_calorie_goal_adjustments_user_created
  ON public.calorie_goal_adjustments (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- RPC transactionnelle : met à jour nutrition_goals.calories (UNIQUEMENT
-- les calories — jamais proteins/carbs/fats, règle absolue Phase 4B) ET
-- insère l'entrée d'historique correspondante dans la même transaction
-- implicite d'appel de fonction — évite le scénario "calories mises à jour,
-- historique manquant" ou l'inverse sans architecture disproportionnée.
-- SECURITY DEFINER + scoping manuel par auth.uid() (même convention que
-- public.award_reward_event, migration 20260724120000).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_calorie_goal_adjustment(
  _mode                 text,
  _applied_calories     integer,
  _recommended_calories integer DEFAULT NULL,
  _goal                 text DEFAULT NULL,
  _target_rate          text DEFAULT NULL,
  _reference_tdee_kcal  integer DEFAULT NULL,
  _reference_source     text DEFAULT NULL,
  _reason               text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _previous_calories integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _mode NOT IN ('manual_apply', 'automatic') THEN
    RAISE EXCEPTION 'Invalid mode: %', _mode;
  END IF;

  IF _applied_calories IS NULL OR _applied_calories <= 0 THEN
    RAISE EXCEPTION 'Invalid applied_calories: %', _applied_calories;
  END IF;

  SELECT calories INTO _previous_calories
  FROM public.nutrition_goals
  WHERE user_id = _user_id;

  INSERT INTO public.nutrition_goals (user_id, calories, goal, target_rate, calorie_strategy_mode)
  VALUES (_user_id, _applied_calories, _goal, _target_rate, 'manual')
  ON CONFLICT (user_id) DO UPDATE SET
    calories = EXCLUDED.calories,
    goal = COALESCE(EXCLUDED.goal, public.nutrition_goals.goal),
    target_rate = COALESCE(EXCLUDED.target_rate, public.nutrition_goals.target_rate),
    last_auto_adjustment_at = CASE
      WHEN _mode = 'automatic' THEN now()
      ELSE public.nutrition_goals.last_auto_adjustment_at
    END;
  -- `proteins`/`carbs`/`fats` volontairement absents de cet UPSERT : jamais
  -- touchés par cette RPC (§12/§41 du brief — les macros auront leur propre
  -- moteur plus tard, un décalage calories/macros après ajustement n'est
  -- pas corrigé silencieusement ici).

  INSERT INTO public.calorie_goal_adjustments (
    user_id, mode, previous_calories, recommended_calories, applied_calories,
    goal, target_rate, reference_tdee_kcal, reference_source, reason
  ) VALUES (
    _user_id, _mode, _previous_calories, _recommended_calories, _applied_calories,
    _goal, _target_rate, _reference_tdee_kcal, _reference_source, _reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_calorie_goal_adjustment(
  text, integer, integer, text, text, integer, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_calorie_goal_adjustment(
  text, integer, integer, text, text, integer, text, text
) TO authenticated;
