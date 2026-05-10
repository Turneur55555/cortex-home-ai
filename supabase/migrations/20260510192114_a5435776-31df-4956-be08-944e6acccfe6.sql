
CREATE OR REPLACE FUNCTION public.prevent_premium_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.premium IS DISTINCT FROM OLD.premium THEN
    RAISE EXCEPTION 'Modification du statut premium non autorisée';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_premium_self_update_trigger ON public.users_profiles;
CREATE TRIGGER prevent_premium_self_update_trigger
BEFORE UPDATE ON public.users_profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_self_update();
