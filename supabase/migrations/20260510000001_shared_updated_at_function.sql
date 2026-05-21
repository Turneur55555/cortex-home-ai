-- Fonction générique pour updated_at — doit exister AVANT tout trigger qui l'appelle.
-- Timestamp volontairement antérieur à toutes les autres migrations.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
