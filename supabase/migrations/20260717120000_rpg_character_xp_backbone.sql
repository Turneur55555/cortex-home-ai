-- =====================================================================
-- RPG R1 — Le Niveau de Personnage : l'XP comme colonne vertébrale.
--
-- Philosophie : CORTEX est un RPG de MUSCULATION. La musculation est la
-- source primaire et largement dominante de progression du personnage.
-- Toutes les autres disciplines sont du soutien (plafonné). La nutrition
-- n'octroie AUCUN XP (module indépendant).
--
-- Barème (voir docs/architecture/rpg-vision-et-r1-niveau-personnage.md) :
--   - Séance muscu ............ 100 XP (non plafonné)
--   - PR muscu (charge) ....... +50 XP (1×/séance)
--   - Streak (muscu, veille) .. +15 XP (1×/séance)
--   - Séance soutien .......... 25 XP, plafond 75 XP/semaine
--   - Nutrition ............... 0 XP
--
-- Invariant garanti par construction : plafond soutien (75) < une seule
-- séance muscu (100) ⇒ muscu-only > soutien-only > nutrition-only.
--
-- Ne touche NI le moteur Rang/Maîtrise, NI les triggers XP existants
-- (badge / objectif restent sur leur chemin légué pour ne rien casser).
-- La courbe de niveau reste `compute_level_from_xp` (sqrt(xp/50)+1),
-- aucune XP déjà accumulée n'est invalidée.
-- =====================================================================

-- ── 1. Journal d'XP (source-tracé), lecture seule côté client ─────────
CREATE TABLE IF NOT EXISTS public.xp_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source     text NOT NULL,   -- workout_muscu | workout_support | pr_muscu | streak | ...
  amount     integer NOT NULL CHECK (amount > 0),
  workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xp_events select own" ON public.xp_events;
CREATE POLICY "xp_events select own"
  ON public.xp_events FOR SELECT
  USING (auth.uid() = user_id);
-- Aucune policy INSERT/UPDATE/DELETE : seul le verseur SECURITY DEFINER écrit.

GRANT SELECT ON public.xp_events TO authenticated;

-- Idempotence : au plus un event d'une source donnée par séance (empêche
-- un double-versement si le trigger de complétion se redéclenche).
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_workout_source_key
  ON public.xp_events(workout_id, source)
  WHERE workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS xp_events_user_created_idx
  ON public.xp_events(user_id, created_at);

-- ── 2. Verseur central d'XP (unique écrivain de user_stats pour les
--       nouvelles sources). SECURITY DEFINER, jamais appelable au client. ─
CREATE OR REPLACE FUNCTION public.award_character_xp(
  _user_id    uuid,
  _source     text,
  _amount     integer,
  _workout_id uuid DEFAULT NULL
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

  -- Idempotence : une source donnée n'est versée qu'une fois par séance.
  IF _workout_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.xp_events
      WHERE workout_id = _workout_id AND source = _source
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.xp_events(user_id, source, amount, workout_id)
  VALUES (_user_id, _source, _amount, _workout_id);

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

REVOKE EXECUTE ON FUNCTION public.award_character_xp(uuid, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── 3. Attribution d'XP à la clôture d'une séance ─────────────────────
-- Se déclenche sur la transition vers `completed` (les séances sont
-- insérées `active` au démarrage puis passées `completed` à la clôture,
-- muscu comme générique). Barème muscu-primaire ci-dessus.
CREATE OR REPLACE FUNCTION public.award_xp_on_workout_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_muscu       boolean;
  support_week   integer;
  award          integer;
  has_pr         boolean;
  had_prev_day   boolean;
  XP_MUSCU        constant integer := 100;
  XP_SUPPORT      constant integer := 25;
  SUPPORT_CAP_WK  constant integer := 75;
  XP_STREAK       constant integer := 15;
  XP_PR           constant integer := 50;
BEGIN
  -- Uniquement à l'entrée dans l'état `completed`.
  IF NOT (
    NEW.status = 'completed'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  ) THEN
    RETURN NEW;
  END IF;

  is_muscu := (COALESCE(NEW.discipline, 'muscu') = 'muscu');

  IF is_muscu THEN
    -- Source primaire, non plafonnée.
    PERFORM public.award_character_xp(NEW.user_id, 'workout_muscu', XP_MUSCU, NEW.id);

    -- PR muscu : au moins un exercice de CETTE séance dont la charge max
    -- dépasse strictement la meilleure charge sur ce même exercice dans les
    -- séances complétées ANTÉRIEURES. Matching par exercise_reference_id
    -- sinon par nom (insensible casse/espaces).
    SELECT EXISTS (
      SELECT 1
      FROM public.exercises e
      JOIN LATERAL (
        SELECT MAX(s.weight) AS w
        FROM public.exercise_sets s
        WHERE s.exercise_id = e.id
      ) cur ON true
      WHERE e.workout_id = NEW.id
        AND cur.w IS NOT NULL
        AND cur.w > COALESCE((
          SELECT MAX(s2.weight)
          FROM public.exercises e2
          JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
          JOIN public.workouts w2 ON w2.id = e2.workout_id
          WHERE w2.user_id = NEW.user_id
            AND w2.status = 'completed'
            AND w2.id <> NEW.id
            AND w2.created_at < NEW.created_at
            AND (
              (e.exercise_reference_id IS NOT NULL
                AND e2.exercise_reference_id = e.exercise_reference_id)
              OR (e.exercise_reference_id IS NULL
                AND lower(btrim(e2.name)) = lower(btrim(e.name)))
            )
        ), 0)
    ) INTO has_pr;

    IF has_pr THEN
      PERFORM public.award_character_xp(NEW.user_id, 'pr_muscu', XP_PR, NEW.id);
    END IF;

    -- Streak (fidélité muscu) : +15 si une séance complétée existe la veille.
    -- Attaché à la muscu pour garantir l'invariant (le soutien-seul reste
    -- borné au plafond hebdo, sans streak).
    SELECT EXISTS (
      SELECT 1 FROM public.workouts w3
      WHERE w3.user_id = NEW.user_id
        AND w3.status = 'completed'
        AND w3.id <> NEW.id
        AND w3.date::date = (NEW.date::date - 1)
    ) INTO had_prev_day;

    IF had_prev_day THEN
      PERFORM public.award_character_xp(NEW.user_id, 'streak', XP_STREAK, NEW.id);
    END IF;

  ELSE
    -- Disciplines de soutien : plafond hebdomadaire strict (< une séance muscu).
    SELECT COALESCE(SUM(amount), 0) INTO support_week
    FROM public.xp_events
    WHERE user_id = NEW.user_id
      AND source = 'workout_support'
      AND created_at >= date_trunc('week', now());

    award := LEAST(XP_SUPPORT, GREATEST(0, SUPPORT_CAP_WK - support_week));
    IF award > 0 THEN
      PERFORM public.award_character_xp(NEW.user_id, 'workout_support', award, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_xp_on_workout_complete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_award_xp_on_workout_complete ON public.workouts;
CREATE TRIGGER trg_award_xp_on_workout_complete
AFTER INSERT OR UPDATE OF status ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_workout_complete();
