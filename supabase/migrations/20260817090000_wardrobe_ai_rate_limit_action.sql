-- Phase 4 Dressing — autorise l'action de rate limiting utilisée par la
-- nouvelle Edge Function d'analyse Vision du dressing (analyze-wardrobe-item).
-- Additive et non destructif : ne touche à aucune donnée, seulement à la
-- liste des valeurs acceptées par la contrainte CHECK existante (même
-- pattern que 20260804090000_rate_limits_action_check_missing_actions.sql).
--
-- Au passage : la tentative d'application a révélé que la contrainte réelle
-- en base autorisait déjà 'nutrition_health_insight' (utilisée en prod par
-- l'Edge Function nutrition-health-insight) alors que cette valeur n'était
-- pas présente dans la dernière migration versionnée du repo — nouvelle
-- dérive base/migrations, hors périmètre Dressing. Reproduite ici pour ne
-- pas régresser Nutrition (aucune donnée supprimée, valeur déjà en usage).
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
    'nutrition_health_insight', 'analyze_wardrobe_item'
  ]));
