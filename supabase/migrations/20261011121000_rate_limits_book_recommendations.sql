-- Nouvelle action de rate-limit pour l'edge function book-recommendations.
ALTER TABLE public.rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image',
    'food_lookup', 'analyze_exercise', 'verify_exercise_rank',
    'nutrition_health_insight', 'analyze_wardrobe_item',
    'estimate_body_fat_photo', 'recipe_import', 'recipe_variants',
    'book_recommendations'
  ]));
