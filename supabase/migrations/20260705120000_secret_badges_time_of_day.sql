-- Badges secrets Night Owl / Early Bird : remplace la valeur fictive
-- (workouts_count >= 999999, inatteignable) par une vérification serveur
-- basée sur l'heure réelle de fin de séance (infalsifiable côté client).
--
-- Fenêtres retenues (heure Europe/Paris) :
--   Night Owl  : [00:00, 06:00)
--   Early Bird : [06:00, 08:00)
-- (plages disjointes — une séance ne peut débloquer que l'un des deux)

-- 1. Le catalogue n'utilise plus requirement_value pour ces deux badges :
--    ils sont débloqués directement par le trigger ci-dessous, jamais via
--    unlock_user_badge()/computeBadgeProgress.
UPDATE public.badges_catalog
SET requirement_type = 'time_of_day', requirement_value = 0
WHERE badge_key IN ('secret_night_owl', 'secret_early_bird');

-- 2. Trigger : évalue l'heure réelle de fin de séance.
--    - Saisie rétroactive : status = 'completed' dès l'INSERT → now() ≈ l'instant du log.
--    - Séance live : le passage à 'completed' se fait via useFinishWorkout au
--      moment réel où l'utilisateur termine → now() est cet instant précis.
CREATE OR REPLACE FUNCTION public.award_time_of_day_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  local_hour int;
  bc public.badges_catalog%ROWTYPE;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  -- Évite de re-déclencher sur une séance déjà marquée completed auparavant.
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  local_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/Paris'))::int;

  IF local_hour >= 0 AND local_hour < 6 THEN
    SELECT * INTO bc FROM public.badges_catalog WHERE badge_key = 'secret_night_owl';
  ELSIF local_hour >= 6 AND local_hour < 8 THEN
    SELECT * INTO bc FROM public.badges_catalog WHERE badge_key = 'secret_early_bird';
  ELSE
    RETURN NEW;
  END IF;

  IF FOUND THEN
    INSERT INTO public.user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description, unlocked_at)
    VALUES (NEW.user_id, bc.badge_key, bc.label, bc.icon, bc.rarity, bc.xp_reward, bc.description, now())
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_award_time_of_day_badges ON public.workouts;
CREATE TRIGGER trg_award_time_of_day_badges
AFTER INSERT OR UPDATE OF status ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.award_time_of_day_badges();

REVOKE EXECUTE ON FUNCTION public.award_time_of_day_badges() FROM PUBLIC, anon, authenticated;
