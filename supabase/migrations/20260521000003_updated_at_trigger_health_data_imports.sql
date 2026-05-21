-- Trigger updated_at manquant sur health_data_imports
-- Les autres tables (nutrition_goals, food_preferences, user_preferences, user_stats)
-- ont déjà leurs triggers. Seule health_data_imports en était dépourvue.

CREATE OR REPLACE FUNCTION public.touch_health_data_imports_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_health_data_imports_updated_at ON public.health_data_imports;
CREATE TRIGGER trg_health_data_imports_updated_at
  BEFORE UPDATE ON public.health_data_imports
  FOR EACH ROW EXECUTE FUNCTION public.touch_health_data_imports_updated_at();
