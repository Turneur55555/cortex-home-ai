-- Phase 5B : application des macros (bouton "Appliquer" + mode automatique),
-- verrous individuels par macro (protéines/glucides/lipides), historique
-- dédié, et atomicité calories+macros lorsque les deux modes automatiques
-- se déclenchent ensemble.
--
-- `macro_strategy_mode` est une préférence INDÉPENDANTE de
-- `calorie_strategy_mode` (migration 20260807090000) — les quatre
-- combinaisons (manuel/manuel, auto/manuel, manuel/auto, auto/auto) sont
-- toutes supportées, voir lib/fitness/macroStrategy.ts. Comme pour
-- `calorie_strategy_mode`, JAMAIS activé automatiquement par cette
-- migration : tout utilisateur (existant ou nouveau) démarre en `manual`.
--
-- Les verrous (`protein_locked`/`carbs_locked`/`fat_locked`) ne stockent
-- PAS de valeur verrouillée dédiée : la valeur verrouillée EST la valeur
-- active correspondante dans `nutrition_goals.proteins/carbs/fats` (§4 du
-- brief) — évite une duplication d'état qui pourrait diverger.
--
-- Aucune perte des objectifs existants : ALTER TABLE ... ADD COLUMN
-- (pas de DROP/recreate), toutes les nouvelles colonnes ont un défaut
-- rétrocompatible. `calories`/`proteins`/`carbs`/`fats`/RLS existante non
-- touchés.

ALTER TABLE public.nutrition_goals
  ADD COLUMN IF NOT EXISTS macro_strategy_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS protein_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carbs_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.nutrition_goals
  DROP CONSTRAINT IF EXISTS nutrition_goals_macro_strategy_mode_check;
ALTER TABLE public.nutrition_goals
  ADD CONSTRAINT nutrition_goals_macro_strategy_mode_check
  CHECK (macro_strategy_mode IN ('manual', 'automatic'));

-- ---------------------------------------------------------------------
-- Historique des ajustements de macros (manuel validé + automatique) —
-- table dédiée plutôt qu'une extension de `calorie_goal_adjustments` :
-- les deux tables ont un sens temporel distinct (une décision calorique
-- n'est pas une décision de répartition), voir §8 du brief.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.macro_goal_adjustments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  mode                  text NOT NULL,
  previous_proteins     integer,
  previous_carbs        integer,
  previous_fats         integer,
  recommended_proteins  integer,
  recommended_carbs     integer,
  recommended_fats      integer,
  applied_proteins      integer NOT NULL,
  applied_carbs         integer NOT NULL,
  applied_fats          integer NOT NULL,
  calorie_target        integer,
  goal                  text,
  protein_locked        boolean,
  carbs_locked          boolean,
  fat_locked            boolean
);

ALTER TABLE public.macro_goal_adjustments
  DROP CONSTRAINT IF EXISTS macro_goal_adjustments_mode_check;
ALTER TABLE public.macro_goal_adjustments
  ADD CONSTRAINT macro_goal_adjustments_mode_check
  CHECK (mode IN ('manual_apply', 'automatic'));

ALTER TABLE public.macro_goal_adjustments
  DROP CONSTRAINT IF EXISTS macro_goal_adjustments_goal_check;
ALTER TABLE public.macro_goal_adjustments
  ADD CONSTRAINT macro_goal_adjustments_goal_check
  CHECK (goal IS NULL OR goal IN ('fat_loss', 'maintenance', 'muscle_gain'));

ALTER TABLE public.macro_goal_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own macro goal adjustments" ON public.macro_goal_adjustments;
CREATE POLICY "Users manage own macro goal adjustments" ON public.macro_goal_adjustments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_macro_goal_adjustments_user_created
  ON public.macro_goal_adjustments (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- RPC transactionnelle : macros SEULES (jamais les calories). Utilisée par
-- le bouton "Appliquer" manuel et par le mode automatique macros lorsque
-- les calories n'ont pas changé dans le même geste. Même convention que
-- `apply_calorie_goal_adjustment` (SECURITY DEFINER, scoping auth.uid()).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_macro_goal_adjustment(
  _mode                  text,
  _applied_proteins      integer,
  _applied_carbs         integer,
  _applied_fats          integer,
  _recommended_proteins  integer DEFAULT NULL,
  _recommended_carbs     integer DEFAULT NULL,
  _recommended_fats      integer DEFAULT NULL,
  _calorie_target        integer DEFAULT NULL,
  _goal                  text DEFAULT NULL,
  _protein_locked        boolean DEFAULT NULL,
  _carbs_locked          boolean DEFAULT NULL,
  _fat_locked            boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _previous_proteins integer;
  _previous_carbs integer;
  _previous_fats integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _mode NOT IN ('manual_apply', 'automatic') THEN
    RAISE EXCEPTION 'Invalid mode: %', _mode;
  END IF;

  IF _applied_proteins IS NULL OR _applied_proteins < 0
     OR _applied_carbs IS NULL OR _applied_carbs < 0
     OR _applied_fats IS NULL OR _applied_fats < 0 THEN
    RAISE EXCEPTION 'Invalid applied macros: %/%/%', _applied_proteins, _applied_carbs, _applied_fats;
  END IF;

  SELECT proteins, carbs, fats INTO _previous_proteins, _previous_carbs, _previous_fats
  FROM public.nutrition_goals
  WHERE user_id = _user_id;

  INSERT INTO public.nutrition_goals (user_id, proteins, carbs, fats)
  VALUES (_user_id, _applied_proteins, _applied_carbs, _applied_fats)
  ON CONFLICT (user_id) DO UPDATE SET
    proteins = EXCLUDED.proteins,
    carbs = EXCLUDED.carbs,
    fats = EXCLUDED.fats;
  -- `calories`/`goal`/`target_rate`/`calorie_strategy_mode` volontairement
  -- absents de cet UPSERT : cette RPC ne touche JAMAIS les calories
  -- (règle absolue Phase 5B, §6).

  INSERT INTO public.macro_goal_adjustments (
    user_id, mode, previous_proteins, previous_carbs, previous_fats,
    recommended_proteins, recommended_carbs, recommended_fats,
    applied_proteins, applied_carbs, applied_fats,
    calorie_target, goal, protein_locked, carbs_locked, fat_locked
  ) VALUES (
    _user_id, _mode, _previous_proteins, _previous_carbs, _previous_fats,
    _recommended_proteins, _recommended_carbs, _recommended_fats,
    _applied_proteins, _applied_carbs, _applied_fats,
    _calorie_target, _goal, _protein_locked, _carbs_locked, _fat_locked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_macro_goal_adjustment(
  text, integer, integer, integer, integer, integer, integer, integer, text, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_macro_goal_adjustment(
  text, integer, integer, integer, integer, integer, integer, integer, text, boolean, boolean, boolean
) TO authenticated;

-- ---------------------------------------------------------------------
-- Extension de `apply_calorie_goal_adjustment` (migration 20260807090000) :
-- paramètres macros optionnels (tous DEFAULT NULL — rétrocompatible avec
-- tout appel existant qui ne les fournit pas). Lorsque les TROIS
-- `_applied_proteins/_applied_carbs/_applied_fats` sont fournis, la RPC met
-- AUSSI à jour les macros et journalise `macro_goal_adjustments` dans la
-- MÊME transaction que l'ajustement calorique — seul moyen d'éviter l'état
-- durable "calories mises à jour, macros encore alignées sur l'ancien
-- objectif" lorsque Calories automatique ET Macros automatique se
-- déclenchent ensemble (§22 du brief). Signature complète re-déclarée
-- (CREATE OR REPLACE), comportement calories-only strictement identique à
-- la Phase 4B quand les paramètres macros sont omis.
-- ---------------------------------------------------------------------

-- `CREATE OR REPLACE FUNCTION` ne remplace RÉELLEMENT une fonction que si la
-- liste de TYPES de paramètres est identique — ajouter des paramètres
-- (même avec DEFAULT) change la signature et créerait un second overload
-- ambigu à côté de l'ancien à 8 paramètres. On supprime donc explicitement
-- l'ancienne signature avant de recréer la fonction étendue.
DROP FUNCTION IF EXISTS public.apply_calorie_goal_adjustment(
  text, integer, integer, text, text, integer, text, text
);

CREATE OR REPLACE FUNCTION public.apply_calorie_goal_adjustment(
  _mode                 text,
  _applied_calories     integer,
  _recommended_calories integer DEFAULT NULL,
  _goal                 text DEFAULT NULL,
  _target_rate          text DEFAULT NULL,
  _reference_tdee_kcal  integer DEFAULT NULL,
  _reference_source     text DEFAULT NULL,
  _reason               text DEFAULT NULL,
  _macro_mode           text DEFAULT NULL,
  _applied_proteins     integer DEFAULT NULL,
  _applied_carbs        integer DEFAULT NULL,
  _applied_fats         integer DEFAULT NULL,
  _recommended_proteins integer DEFAULT NULL,
  _recommended_carbs    integer DEFAULT NULL,
  _recommended_fats     integer DEFAULT NULL,
  _protein_locked       boolean DEFAULT NULL,
  _carbs_locked         boolean DEFAULT NULL,
  _fat_locked           boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _previous_calories integer;
  _previous_proteins integer;
  _previous_carbs integer;
  _previous_fats integer;
  _apply_macros boolean := _applied_proteins IS NOT NULL
    AND _applied_carbs IS NOT NULL
    AND _applied_fats IS NOT NULL;
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

  IF _apply_macros AND (_applied_proteins < 0 OR _applied_carbs < 0 OR _applied_fats < 0) THEN
    RAISE EXCEPTION 'Invalid applied macros: %/%/%', _applied_proteins, _applied_carbs, _applied_fats;
  END IF;

  SELECT calories, proteins, carbs, fats
    INTO _previous_calories, _previous_proteins, _previous_carbs, _previous_fats
  FROM public.nutrition_goals
  WHERE user_id = _user_id;

  INSERT INTO public.nutrition_goals (
    user_id, calories, goal, target_rate, calorie_strategy_mode, proteins, carbs, fats
  )
  VALUES (
    _user_id, _applied_calories, _goal, _target_rate, 'manual',
    _applied_proteins, _applied_carbs, _applied_fats
  )
  ON CONFLICT (user_id) DO UPDATE SET
    calories = EXCLUDED.calories,
    goal = COALESCE(EXCLUDED.goal, public.nutrition_goals.goal),
    target_rate = COALESCE(EXCLUDED.target_rate, public.nutrition_goals.target_rate),
    last_auto_adjustment_at = CASE
      WHEN _mode = 'automatic' THEN now()
      ELSE public.nutrition_goals.last_auto_adjustment_at
    END,
    proteins = CASE WHEN _apply_macros THEN _applied_proteins ELSE public.nutrition_goals.proteins END,
    carbs = CASE WHEN _apply_macros THEN _applied_carbs ELSE public.nutrition_goals.carbs END,
    fats = CASE WHEN _apply_macros THEN _applied_fats ELSE public.nutrition_goals.fats END;

  INSERT INTO public.calorie_goal_adjustments (
    user_id, mode, previous_calories, recommended_calories, applied_calories,
    goal, target_rate, reference_tdee_kcal, reference_source, reason
  ) VALUES (
    _user_id, _mode, _previous_calories, _recommended_calories, _applied_calories,
    _goal, _target_rate, _reference_tdee_kcal, _reference_source, _reason
  );

  IF _apply_macros THEN
    INSERT INTO public.macro_goal_adjustments (
      user_id, mode, previous_proteins, previous_carbs, previous_fats,
      recommended_proteins, recommended_carbs, recommended_fats,
      applied_proteins, applied_carbs, applied_fats,
      calorie_target, goal, protein_locked, carbs_locked, fat_locked
    ) VALUES (
      _user_id, COALESCE(_macro_mode, _mode), _previous_proteins, _previous_carbs, _previous_fats,
      _recommended_proteins, _recommended_carbs, _recommended_fats,
      _applied_proteins, _applied_carbs, _applied_fats,
      _applied_calories, _goal, _protein_locked, _carbs_locked, _fat_locked
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_calorie_goal_adjustment(
  text, integer, integer, text, text, integer, text, text,
  text, integer, integer, integer, integer, integer, integer, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_calorie_goal_adjustment(
  text, integer, integer, text, text, integer, text, text,
  text, integer, integer, integer, integer, integer, integer, boolean, boolean, boolean
) TO authenticated;
