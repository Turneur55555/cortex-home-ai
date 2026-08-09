-- ============================================================
-- RPG V2 Phase H — sécurisation serveur des Ascensions.
--
-- PROBLÈME (audit Phase H) : `record_cortex_ascension(_tier_index integer)`
-- (migration 20260829150000) était certes gatée (monotonicité stricte +
-- changement de Titre uniquement, `previous_tier_index` dérivé serveur),
-- mais restait appelable directement par le client authentifié, qui
-- fournissait lui-même `_tier_index` — sans que le serveur ne recalcule
-- le Rang musculaire ni la Puissance Cortex réels du joueur avant
-- d'accepter la valeur.
--
-- CORRECTION : le client ne peut plus jamais appeler cette fonction. Seule
-- l'Edge Function `sync-cortex-ascension` (service role) peut l'appeler,
-- après avoir recalculé ENTIÈREMENT côté serveur :
--   performances (exercise_sets/exercises/workouts, RLS scopée à l'appelant)
--   → Rang par exercice (`_shared/rankEngine.ts`, déjà utilisé par
--     `verify-exercise-rank`, parité garantie par
--     `src/lib/fitness/rank/rankEngine.sql-parity.test.ts`)
--   → Rang musculaire + Puissance Cortex (`_shared/cortexEngine.ts`, copie
--     fidèle de muscleMapping/muscleRank/muscleAggregation/cortexPower,
--     parité garantie par
--     `src/lib/fitness/rpg/cortexEngine.sql-parity.test.ts`).
--
-- Le nouveau signature accepte `_user_id` explicitement (les appels
-- service role ne portent pas de JWT utilisateur, `auth.uid()` y est NULL)
-- — ce n'est PAS une régression de confiance : EXECUTE est révoqué pour
-- `authenticated`/`anon`, seul `service_role` (jamais exposé au client)
-- peut appeler cette fonction. Un client malveillant ne peut donc plus se
-- déclarer lui-même "Titan" : il ne peut qu'appeler l'Edge Function, qui
-- ignore toute valeur envoyée par le client et ne calcule le tier_index
-- qu'à partir des données réelles de CE user_id authentifié (contrôlé par
-- son propre JWT côté Edge Function, jamais transmis en paramètre libre).
-- ============================================================

DROP FUNCTION IF EXISTS public.record_cortex_ascension(integer);

CREATE OR REPLACE FUNCTION public.record_cortex_ascension(_user_id uuid, _tier_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_max   integer;
  _current_title integer;
  _new_title     integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  IF _tier_index IS NULL OR _tier_index < 0 OR _tier_index > 29 THEN
    RETURN; -- valeur hors domaine, ignorée silencieusement
  END IF;

  SELECT max(tier_index) INTO _current_max
  FROM public.cortex_ascensions
  WHERE user_id = _user_id;

  _current_title := CASE WHEN _current_max IS NULL THEN -1 ELSE _current_max / 5 END;
  _new_title := _tier_index / 5;

  -- Ascension = changement de TITRE uniquement (pas un simple changement
  -- de grade au sein du même Titre) ET progression strictement croissante
  -- — défense en profondeur : ce garde-fou reste vrai même si le
  -- tier_index reçu est déjà digne de confiance (calculé serveur).
  IF _new_title <= _current_title THEN
    RETURN;
  END IF;

  INSERT INTO public.cortex_ascensions (user_id, tier_index, previous_tier_index)
  VALUES (_user_id, _tier_index, _current_max)
  ON CONFLICT (user_id, tier_index) DO NOTHING;
END;
$$;

-- Seul le service role (Edge Function `sync-cortex-ascension`, jamais le
-- navigateur) peut appeler cette fonction désormais.
REVOKE ALL ON FUNCTION public.record_cortex_ascension(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cortex_ascension(uuid, integer) TO service_role;

-- Nouvelle action de rate limiting pour l'Edge Function de synchronisation.
ALTER TABLE public.rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_check;
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout', 'recipe_assistant',
    'muscle_readiness', 'chat', 'scan_image', 'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image', 'food_lookup',
    'analyze_exercise', 'verify_exercise_rank', 'nutrition_health_insight',
    'analyze_wardrobe_item', 'estimate_body_fat_photo', 'recipe_import', 'recipe_variants',
    'sync_cortex_ascension'
  ]));
