-- ══════════════════════════════════════════════════════════════════════════════
-- FIX : deux contraintes CHECK en retard sur le code, causant des erreurs
-- réelles côté utilisateurs — détecté par le Health Check quotidien (run du
-- 05/08/2026).
--
-- 1) nutrition_favorites_meal_check n'autorisait pas 'gouter', pourtant un
--    MEAL_SLUGS légitime et utilisé partout ailleurs (nutrition_meal_check,
--    saved_meal_items) — voir supabase/functions/_shared/meals.ts, seule
--    source de vérité des slugs de repas. Le code est correct, seule cette
--    contrainte précise avait été oubliée lors de l'ajout de 'gouter'.
--
-- 2) rate_limits_action_check n'autorisait pas 'estimate_body_fat_photo',
--    pourtant utilisée en prod par l'Edge Function estimate-body-fat-photo
--    (supabase/functions/estimate-body-fat-photo/index.ts, déployée et
--    ACTIVE) depuis la migration 20260812090000_body_fat_photo_estimation.sql
--    — jamais ajoutée à la contrainte à ce moment-là.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.nutrition_favorites
  DROP CONSTRAINT IF EXISTS nutrition_favorites_meal_check;

ALTER TABLE public.nutrition_favorites
  ADD CONSTRAINT nutrition_favorites_meal_check
  CHECK (meal = ANY (ARRAY[
    'petit-dej', 'petit-dejeuner', 'dejeuner', 'gouter', 'diner', 'collation'
  ]));

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
    'nutrition_health_insight', 'analyze_wardrobe_item',
    'estimate_body_fat_photo'
  ]));
