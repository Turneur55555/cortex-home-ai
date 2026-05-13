ALTER TABLE public.rate_limits DROP CONSTRAINT rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action IN ('analyze_pdf','scan_fridge','scan_meal','coach_workout','recipe_assistant','muscle_readiness','chat','scan_image'));