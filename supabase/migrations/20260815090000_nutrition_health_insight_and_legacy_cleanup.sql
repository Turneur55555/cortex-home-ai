-- Phase 9A : ajoute l'action de rate-limit pour la nouvelle fonction
-- d'analyse intelligente (ne réutilise jamais un provider/action existant
-- sans l'avoir dans la liste — même discipline que chaque phase IA
-- précédente : analyze_pdf, scan_meal, estimate_body_fat_photo, etc.).
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
    'estimate_body_fat_photo', 'nutrition_health_insight'
  ]));

-- Phase 9C — Audit V1 : nettoyage legacy confirmé mort. `nutrition_goals.
-- objective`/`weight_kg`/`activity_factor`/`fiber_g` ont été ajoutées par
-- la migration 20260618102110_nutrition_food_logs_and_goals.sql pour
-- l'ancienne RPC `compute_nutrition_targets`, déjà supprimée (DROP
-- FUNCTION ... CASCADE) par 20260619080840_drop_nutrition_stack_b.sql.
-- Vérifié pendant l'audit Phase 9 : aucun appelant frontend (`src/hooks/
-- useNutritionGoals.ts` ne sélectionne aucune des 4 colonnes), aucune
-- fonction/RPC restante n'y fait référence. Confirmé mort + aucun
-- appelant + aucune dépendance DB active (§47 du brief Phase 9) →
-- suppression propre. Ne touche PAS `fiber_g` des AUTRES tables
-- (food_logs/nutrition_items/recipes), qui reste utilisé.
ALTER TABLE public.nutrition_goals
  DROP COLUMN IF EXISTS objective,
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS activity_factor,
  DROP COLUMN IF EXISTS fiber_g;
