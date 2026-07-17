-- =====================================================================
-- RPG Saisons — Lot S0 : le socle.
--
-- Modèle de données du système de Saisons + attribution des Points de
-- Saison (PS) à la clôture d'une séance de MUSCULATION, + une première
-- saison authorée (« Saison I — L'Ascension »).
--
-- Philosophie (voir docs/architecture/rpg-saisons.md) :
--   - Les PS sont 100 % musculation (le soutien/la nutrition = 0 PS).
--   - Deux voies séparées : le Niveau de Personnage (XP, permanent, R1) et
--     le Palier de Saison (PS, temporaire, remis à zéro chaque saison).
--   - Serveur-autoritaire : le client n'écrit jamais ces tables (comme R1),
--     seules des fonctions SECURITY DEFINER le font.
--
-- Ne touche NI le moteur Rang, NI l'XP/Niveau (R1) : le trigger PS est
-- SÉPARÉ de trg_award_xp_on_workout_complete (ils coexistent sans conflit).
--
-- Courbe du track : PLACEHOLDER linéaire (100 PS = 1 palier, 50 paliers max)
-- destiné à être CALIBRÉ sur données réelles pendant S0 — il suffit d'ajuster
-- compute_season_tier() (une constante), aucune donnée n'est invalidée.
-- =====================================================================

-- ── 1. Catalogue des saisons (lisible par tous les authentifiés) ──────
CREATE TABLE IF NOT EXISTS public.seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  index      integer NOT NULL UNIQUE,          -- 1, 2, 3…
  slug       text NOT NULL UNIQUE,             -- 'ascension'
  name       text NOT NULL,                    -- 'L''Ascension'
  theme      text,                             -- direction artistique / accent
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  status     text NOT NULL DEFAULT 'upcoming', -- upcoming | active | ended
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasons readable by authenticated" ON public.seasons;
CREATE POLICY "seasons readable by authenticated"
  ON public.seasons FOR SELECT
  TO authenticated
  USING (true);
GRANT SELECT ON public.seasons TO authenticated;

CREATE INDEX IF NOT EXISTS seasons_status_idx ON public.seasons(status);

-- ── 2. Journal des Points de Saison (source-tracé, lecture seule) ─────
CREATE TABLE IF NOT EXISTS public.sp_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id  uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  source     text NOT NULL,   -- workout_muscu | (S1: pr_muscu | quest | objective …)
  amount     integer NOT NULL CHECK (amount > 0),
  workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sp_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sp_events select own" ON public.sp_events;
CREATE POLICY "sp_events select own"
  ON public.sp_events FOR SELECT
  USING (auth.uid() = user_id);
GRANT SELECT ON public.sp_events TO authenticated;

-- Idempotence : une source donnée n'est versée qu'une fois par séance.
CREATE UNIQUE INDEX IF NOT EXISTS sp_events_workout_source_key
  ON public.sp_events(workout_id, source)
  WHERE workout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sp_events_user_season_idx
  ON public.sp_events(user_id, season_id);

-- ── 3. Progression de saison par utilisateur (lecture seule) ──────────
CREATE TABLE IF NOT EXISTS public.user_season_progress (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  ps          integer NOT NULL DEFAULT 0,
  tier        integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);

ALTER TABLE public.user_season_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_season_progress select own" ON public.user_season_progress;
CREATE POLICY "user_season_progress select own"
  ON public.user_season_progress FOR SELECT
  USING (auth.uid() = user_id);
GRANT SELECT ON public.user_season_progress TO authenticated;

-- ── 4. Courbe du track (PLACEHOLDER calibrable) ───────────────────────
-- tier = floor(ps / 100), plafonné à 50. « ~1 séance muscu = 1 palier ».
-- Calibrage S0 : ajuster les deux constantes ci-dessous après analyse
-- des statistiques d'usage réelles — aucune donnée invalidée.
CREATE OR REPLACE FUNCTION public.compute_season_tier(_ps integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(50, GREATEST(0, FLOOR(GREATEST(_ps, 0)::numeric / 100.0)::int));
$$;

-- ── 5. Verseur central de Points de Saison (SECURITY DEFINER) ─────────
CREATE OR REPLACE FUNCTION public.award_season_points(
  _user_id    uuid,
  _season_id  uuid,
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
  new_ps integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 OR _season_id IS NULL THEN
    RETURN;
  END IF;

  -- Idempotence : une source donnée n'est versée qu'une fois par séance.
  IF _workout_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.sp_events
      WHERE workout_id = _workout_id AND source = _source
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.sp_events(user_id, season_id, source, amount, workout_id)
  VALUES (_user_id, _season_id, _source, _amount, _workout_id);

  INSERT INTO public.user_season_progress(user_id, season_id, ps, tier, updated_at)
  VALUES (_user_id, _season_id, _amount, public.compute_season_tier(_amount), now())
  ON CONFLICT (user_id, season_id) DO UPDATE
    SET ps         = public.user_season_progress.ps + _amount,
        tier       = public.compute_season_tier(public.user_season_progress.ps + _amount),
        updated_at = now()
  RETURNING ps INTO new_ps;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_season_points(uuid, uuid, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── 6. Attribution des PS à la clôture d'une séance de MUSCULATION ────
-- Trigger SÉPARÉ de celui de l'XP (R1). Ne verse des PS que pour la muscu,
-- et uniquement s'il existe une saison active à la date de la séance.
CREATE OR REPLACE FUNCTION public.award_sp_on_workout_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_season uuid;
  PS_MUSCU constant integer := 100;  -- placeholder calibrable (voir compute_season_tier)
BEGIN
  -- Uniquement à l'entrée dans l'état `completed`.
  IF NOT (
    NEW.status = 'completed'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  ) THEN
    RETURN NEW;
  END IF;

  -- Saison 100 % muscu : le soutien / la nutrition ne rapportent aucun PS.
  IF COALESCE(NEW.discipline, 'muscu') <> 'muscu' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO active_season
  FROM public.seasons
  WHERE status = 'active'
    AND now() >= starts_at
    AND now() < ends_at
  ORDER BY starts_at DESC
  LIMIT 1;

  IF active_season IS NULL THEN
    RETURN NEW; -- intersaison : aucun PS versé.
  END IF;

  PERFORM public.award_season_points(NEW.user_id, active_season, 'workout_muscu', PS_MUSCU, NEW.id);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_sp_on_workout_complete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_award_sp_on_workout_complete ON public.workouts;
CREATE TRIGGER trg_award_sp_on_workout_complete
AFTER INSERT OR UPDATE OF status ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.award_sp_on_workout_complete();

-- ── 7. Saison I — L'Ascension (authorée, active dès le déploiement) ───
-- Fenêtre de 12 semaines (84 jours) à partir du déploiement. Idempotent.
INSERT INTO public.seasons (index, slug, name, theme, starts_at, ends_at, status)
VALUES (
  1,
  'ascension',
  'L''Ascension',
  'Les premiers sommets — la saison des fondations.',
  date_trunc('day', now()),
  date_trunc('day', now()) + interval '84 days',
  'active'
)
ON CONFLICT (index) DO NOTHING;
