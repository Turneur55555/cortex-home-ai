
-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 1 : rate_limits_action_check — ajouter les actions manquantes
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.rate_limits
  DROP CONSTRAINT IF EXISTS rate_limits_action_check;

ALTER TABLE public.rate_limits
  ADD CONSTRAINT rate_limits_action_check
  CHECK (action = ANY (ARRAY[
    'analyze_pdf', 'scan_fridge', 'scan_meal', 'coach_workout',
    'recipe_assistant', 'muscle_readiness', 'chat', 'scan_image',
    'parse_meal_text', 'scan_exercise',
    'analyze_exercise_muscles', 'analyze_workout', 'analyze_image'
  ]));

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 2 : unlock_user_badge — fonction RPC manquante
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unlock_user_badge(_badge_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id  uuid := auth.uid();
  _badge    badges_catalog%ROWTYPE;
  _exists   boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Récupérer le badge dans le catalogue
  SELECT * INTO _badge FROM badges_catalog WHERE badge_key = _badge_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Badge not found: %', _badge_key;
  END IF;

  -- Ne rien faire si déjà déverrouillé
  SELECT EXISTS(
    SELECT 1 FROM user_badges WHERE user_id = _user_id AND badge_key = _badge_key
  ) INTO _exists;
  IF _exists THEN RETURN; END IF;

  -- Insérer le badge
  INSERT INTO user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  VALUES (
    _user_id, _badge_key, _badge.label, _badge.icon,
    _badge.rarity, _badge.xp_reward, _badge.description
  )
  ON CONFLICT DO NOTHING;

  -- Mettre à jour XP + niveau dans user_stats (upsert)
  INSERT INTO user_stats (user_id, xp, level, total_actions)
  VALUES (_user_id, _badge.xp_reward, 1, 0)
  ON CONFLICT (user_id) DO UPDATE
    SET xp         = user_stats.xp + _badge.xp_reward,
        level      = GREATEST(1, floor(sqrt((user_stats.xp + _badge.xp_reward)::float / 100))::int + 1),
        updated_at = now();
END;
$$;

-- Accès : tout utilisateur authentifié peut appeler cette fonction
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 3 : Storage RLS — chemin user-exercise/{user_id}/... non couvert
-- ══════════════════════════════════════════════════════════════════════════════
-- La policy existante vérifie foldername[1] = user_id
-- mais le code upload dans user-exercise/{user_id}/... (user_id est en position [2])
DROP POLICY IF EXISTS "exercise-images user subfolder upload" ON storage.objects;
CREATE POLICY "exercise-images user subfolder upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);

-- Policy SELECT pour lire les photos uploadées dans le sous-dossier
CREATE POLICY "exercise-images user subfolder select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);

-- Policy DELETE pour supprimer ses propres photos
CREATE POLICY "exercise-images user subfolder delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'exercise-images'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
