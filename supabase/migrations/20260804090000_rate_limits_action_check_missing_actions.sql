-- ══════════════════════════════════════════════════════════════════════════════
-- FIX : rate_limits_action_check — actions manquantes causant des violations
-- Ces trois actions sont utilisées par des Edge Functions déjà en prod
-- (food-lookup, analyze-exercise, verify-exercise-rank) mais n'avaient jamais
-- été ajoutées à la contrainte CHECK, provoquant des erreurs silencieuses
-- "new row for relation rate_limits violates check constraint" à chaque appel.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.rate_limits
  DROP CONSTRAINT IF EXISTS rate_limits_action_check;

ALTER TABLE public.rate_limits
  ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image',
    'food_lookup', 'analyze_exercise', 'verify_exercise_rank'
  ]));
