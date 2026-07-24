-- =====================================================================
-- Sécurité — `award_reward_event` ne doit JAMAIS faire confiance aux
-- paramètres envoyés par le client (`security review`, 24/07/2026).
--
-- Faille : la fonction lisait bien `reward_catalog` pour le MONTANT, mais
-- ne vérifiait jamais que l'ÉVÉNEMENT déclaré par le client avait
-- réellement eu lieu. Un utilisateur authentifié pouvait :
--   1) appeler la RPC avec un `_workout_id` NULL et un `_dedup_key`
--      arbitraire (changé à chaque appel) pour verser de l'XP à l'infini,
--      sans aucune séance réelle ('workout_muscu' n'a pas de plafond
--      hebdomadaire) ;
--   2) appeler la RPC avec le `_workout_id` d'une séance à eux non
--      complétée (brouillon) pour obtenir l'XP d'une séance jamais
--      terminée ;
--   3) déclarer 'streak' sans qu'aucune séance la veille n'existe
--      réellement, ou 'workout_support' sur une séance muscu (et
--      inversement), la fonction ne recoupant jamais la discipline.
--
-- Correctif : comportement observable inchangé pour tout appel LÉGITIME
-- (mêmes montants, même plafond hebdomadaire, même idempotence) — mais la
-- fonction recalcule désormais elle-même, à partir de l'état réel en
-- base, que l'événement a bien eu lieu et appartient à `auth.uid()` :
--   - `_workout_id` devient obligatoire (aucune source cliente n'existe
--     sans séance associée) et doit référencer une séance `completed`
--     appartenant à l'appelant ;
--   - la discipline de la séance est revérifiée pour 'workout_muscu' /
--     'workout_support' ;
--   - 'streak' recalcule lui-même la présence d'une séance complétée la
--     veille, exactement comme le trigger `award_xp_on_workout_complete` ;
--   - toute source non explicitement re-vérifiée ici est refusée par
--     défaut (deny-by-default, même principe que `claim_achievement`,
--     migration 20260721130000) ;
--   - le `_dedup_key` envoyé par le client est ignoré : l'idempotence
--     repose uniquement sur le couple (séance, source), déjà garanti par
--     l'index unique `xp_events_workout_source_key`.
--
-- En complément, `award_character_xp` capture désormais explicitement la
-- violation de contrainte unique (au lieu d'un SELECT-puis-INSERT
-- non atomique) : deux appels concurrents pour le même événement ne
-- peuvent plus jamais aboutir à un double versement, ni faire échouer
-- l'appelant en retard avec une erreur de contrainte.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.award_character_xp(
  _user_id    uuid,
  _source     text,
  _amount     integer,
  _workout_id uuid DEFAULT NULL,
  _dedup_key  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_xp integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.xp_events(user_id, source, amount, workout_id, dedup_key)
    VALUES (_user_id, _source, _amount, _workout_id, _dedup_key);
  EXCEPTION WHEN unique_violation THEN
    -- Événement déjà versé (même séance+source, ou même dedup_key) :
    -- idempotence atomique, y compris sous appels concurrents.
    RETURN;
  END;

  INSERT INTO public.user_stats(user_id, xp, level, total_actions)
  VALUES (_user_id, _amount, 1, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET xp            = public.user_stats.xp + _amount,
        total_actions = public.user_stats.total_actions + 1,
        updated_at    = now()
  RETURNING xp INTO new_xp;

  UPDATE public.user_stats
    SET level = public.compute_level_from_xp(new_xp)
    WHERE user_id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_character_xp(uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ── RPC générique — désormais serveur-autoritaire sur l'existence même
--    de l'événement, pas seulement sur son montant. ─────────────────────
CREATE OR REPLACE FUNCTION public.award_reward_event(
  _source_key text,
  _dedup_key  text DEFAULT NULL,
  _workout_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id      uuid := auth.uid();
  _cat          public.reward_catalog%rowtype;
  _workout      public.workouts%rowtype;
  _week_sum     integer;
  _award        integer;
  _had_prev_day boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _cat FROM public.reward_catalog
  WHERE source_key = _source_key AND active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Aucune source cliente connue n'existe sans séance : refuser tout
  -- appel sans `_workout_id` plutôt que de faire confiance à un
  -- `_dedup_key` librement choisi par le client.
  IF _workout_id IS NULL THEN
    RETURN;
  END IF;

  -- La séance doit réellement exister, appartenir à l'appelant et être
  -- complétée — jamais déduit des paramètres envoyés par le client.
  SELECT * INTO _workout FROM public.workouts
  WHERE id = _workout_id AND user_id = _user_id AND status = 'completed';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Re-vérification serveur de l'événement lui-même, par source
  -- whitelistée. Toute source non listée ici est refusée par défaut
  -- (deny-by-default) : ajouter une future source nécessite d'ajouter
  -- sa propre preuve de véracité, jamais de faire confiance au client.
  CASE _source_key
    WHEN 'workout_muscu' THEN
      IF COALESCE(_workout.discipline, 'muscu') <> 'muscu' THEN
        RETURN;
      END IF;

    WHEN 'workout_support' THEN
      IF COALESCE(_workout.discipline, 'muscu') = 'muscu' THEN
        RETURN;
      END IF;

    WHEN 'streak' THEN
      IF COALESCE(_workout.discipline, 'muscu') <> 'muscu' THEN
        RETURN;
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM public.workouts w
        WHERE w.user_id = _user_id
          AND w.status = 'completed'
          AND w.id <> _workout.id
          AND w.date::date = (_workout.date::date - 1)
      ) INTO _had_prev_day;
      IF NOT _had_prev_day THEN
        RETURN;
      END IF;

    ELSE
      RETURN;
  END CASE;

  _award := _cat.xp_amount;

  IF _cat.weekly_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO _week_sum
    FROM public.xp_events
    WHERE user_id = _user_id
      AND source = _source_key
      AND created_at >= date_trunc('week', now());
    _award := LEAST(_award, GREATEST(0, _cat.weekly_cap - _week_sum));
  END IF;

  IF _award <= 0 THEN
    RETURN;
  END IF;

  -- Idempotence dérivée du couple (séance, source) uniquement : le
  -- `_dedup_key` du client n'est jamais transmis au verseur.
  PERFORM public.award_character_xp(_user_id, _source_key, _award, _workout.id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.award_reward_event(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_reward_event(text, text, uuid) TO authenticated;
