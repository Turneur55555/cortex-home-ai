-- Trigger updated_at manquant sur health_data_imports.
-- Utilise touch_updated_at() définie en 20260510000001 (générique et partagée).

DROP TRIGGER IF EXISTS trg_health_data_imports_updated_at ON public.health_data_imports;
CREATE TRIGGER trg_health_data_imports_updated_at
  BEFORE UPDATE ON public.health_data_imports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
