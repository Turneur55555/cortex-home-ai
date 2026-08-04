-- Phase 7 : traçabilité de la SOURCE d'un ajustement de macros.
--
-- `calorie_goal_adjustments` a déjà une colonne `reason text` libre
-- (migration 20260807090000) mais `macro_goal_adjustments` n'en avait
-- aucune — lacune constatée pendant l'audit Phase 7 (§26 du brief :
-- « Audite si le schéma actuel permet de conserver une raison/source. Si
-- non, n'ajoute une petite extension que si nécessaire »). Ajout additif
-- minimal, même pattern que la colonne existante côté calories : texte
-- libre, nullable, aucune contrainte CHECK. Permet par exemple de tracer
-- "lean_mass" quand une composition corporelle a influencé la
-- recommandation, sans construire un système d'audit dédié.

ALTER TABLE public.macro_goal_adjustments
  ADD COLUMN IF NOT EXISTS reason text;

-- IMPORTANT : ajouter un paramètre trailing change la SIGNATURE (nombre
-- d'arguments) de la fonction — `CREATE OR REPLACE FUNCTION` avec une
-- signature différente crée un NOUVEL objet fonction surchargé au lieu de
-- remplacer l'ancien (constaté en conditions réelles pendant cette
-- migration : les deux versions coexistaient, risquant un appel ambigu
-- côté client). Les anciennes signatures (12 et 18 paramètres) sont donc
-- explicitement supprimées avant recréation.
DROP FUNCTION IF EXISTS public.apply_macro_goal_adjustment(text, integer, integer, integer, integer, integer, integer, integer, text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.apply_calorie_goal_adjustment(text, integer, integer, text, text, integer, text, text, text, integer, integer, integer, integer, integer, integer, boolean, boolean, boolean);

-- Étend `apply_macro_goal_adjustment` avec `_reason` optionnel (dernier
-- paramètre, DEFAULT NULL — appel existant inchangé, purement additif).
CREATE OR REPLACE FUNCTION public.apply_macro_goal_adjustment(
  _mode text,
  _applied_proteins integer,
  _applied_carbs integer,
  _applied_fats integer,
  _recommended_proteins integer DEFAULT NULL::integer,
  _recommended_carbs integer DEFAULT NULL::integer,
  _recommended_fats integer DEFAULT NULL::integer,
  _calorie_target integer DEFAULT NULL::integer,
  _goal text DEFAULT NULL::text,
  _protein_locked boolean DEFAULT NULL::boolean,
  _carbs_locked boolean DEFAULT NULL::boolean,
  _fat_locked boolean DEFAULT NULL::boolean,
  _reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    calorie_target, goal, protein_locked, carbs_locked, fat_locked, reason
  ) VALUES (
    _user_id, _mode, _previous_proteins, _previous_carbs, _previous_fats,
    _recommended_proteins, _recommended_carbs, _recommended_fats,
    _applied_proteins, _applied_carbs, _applied_fats,
    _calorie_target, _goal, _protein_locked, _carbs_locked, _fat_locked, _reason
  );
END;
$function$;

-- Étend `apply_calorie_goal_adjustment` avec `_macro_reason` optionnel
-- (même principe que `_macro_mode` déjà présent) pour le chemin combiné
-- Calories auto + Macros auto (dernier paramètre, DEFAULT NULL — appel
-- existant inchangé).
CREATE OR REPLACE FUNCTION public.apply_calorie_goal_adjustment(
  _mode text,
  _applied_calories integer,
  _recommended_calories integer DEFAULT NULL::integer,
  _goal text DEFAULT NULL::text,
  _target_rate text DEFAULT NULL::text,
  _reference_tdee_kcal integer DEFAULT NULL::integer,
  _reference_source text DEFAULT NULL::text,
  _reason text DEFAULT NULL::text,
  _macro_mode text DEFAULT NULL::text,
  _applied_proteins integer DEFAULT NULL::integer,
  _applied_carbs integer DEFAULT NULL::integer,
  _applied_fats integer DEFAULT NULL::integer,
  _recommended_proteins integer DEFAULT NULL::integer,
  _recommended_carbs integer DEFAULT NULL::integer,
  _recommended_fats integer DEFAULT NULL::integer,
  _protein_locked boolean DEFAULT NULL::boolean,
  _carbs_locked boolean DEFAULT NULL::boolean,
  _fat_locked boolean DEFAULT NULL::boolean,
  _macro_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      calorie_target, goal, protein_locked, carbs_locked, fat_locked, reason
    ) VALUES (
      _user_id, COALESCE(_macro_mode, _mode), _previous_proteins, _previous_carbs, _previous_fats,
      _recommended_proteins, _recommended_carbs, _recommended_fats,
      _applied_proteins, _applied_carbs, _applied_fats,
      _applied_calories, _goal, _protein_locked, _carbs_locked, _fat_locked, _macro_reason
    );
  END IF;
END;
$function$;

-- Les nouveaux objets fonction (signature différente, voir plus haut) ne
-- portent PAS les REVOKE/GRANT explicites de la migration d'origine —
-- Postgres accorde EXECUTE à PUBLIC par défaut pour une fonction fraîchement
-- créée. Sans ce bloc, `anon` retrouverait un accès EXECUTE (régression de
-- sécurité constatée et corrigée pendant cette migration).
REVOKE ALL ON FUNCTION public.apply_macro_goal_adjustment(text, integer, integer, integer, integer, integer, integer, integer, text, boolean, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_macro_goal_adjustment(text, integer, integer, integer, integer, integer, integer, integer, text, boolean, boolean, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_calorie_goal_adjustment(text, integer, integer, text, text, integer, text, text, text, integer, integer, integer, integer, integer, integer, boolean, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_calorie_goal_adjustment(text, integer, integer, text, text, integer, text, text, text, integer, integer, integer, integer, integer, integer, boolean, boolean, boolean, text) TO authenticated;
