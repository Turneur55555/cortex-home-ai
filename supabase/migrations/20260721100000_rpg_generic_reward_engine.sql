-- =====================================================================
-- RPG — Le Reward Engine générique (fondation définitive, pas un cas
-- particulier de plus).
--
-- Contexte : jusqu'ici chaque source d'XP (séance muscu/soutien, PR,
-- streak, badge, objectif) avait son propre chemin d'attribution, avec des
-- montants codés en dur dans le PL/pgSQL (`award_xp_on_workout_complete`).
-- Nathan veut une plateforme générique capable d'accueillir un nombre
-- illimité de sources futures (rang par exercice, Chroniques, défis,
-- succès, saisons...) SANS ajouter une RPC par fonctionnalité et SANS
-- toucher l'architecture à chaque ajout.
--
-- Principe : catalogue de récompenses (table éditable) + UNE seule RPC
-- générique `award_reward_event(source_key, dedup_key, workout_id)`. Le
-- client ne choisit JAMAIS le montant — il déclare seulement qu'un
-- événement whitelisté a eu lieu ; le serveur regarde le catalogue et
-- décide. Ajouter une future source = une ligne dans `reward_catalog`,
-- jamais une modification de fonction.
--
-- Ne touche NI le moteur Rang/Maîtrise par exercice NI les Saisons (`sp_events`
-- reste un système séparé, inchangé). Les 4 sources déjà en production
-- (workout_muscu/workout_support/pr_muscu/streak) sont MIGRÉES vers le
-- catalogue (même montants, même comportement observable) — le trigger
-- existant lit désormais le catalogue au lieu de constantes en dur.
-- =====================================================================

-- ── 1. Catalogue des récompenses — LA source de vérité des montants ────
CREATE TABLE IF NOT EXISTS public.reward_catalog (
  source_key  text PRIMARY KEY,
  xp_amount   integer NOT NULL CHECK (xp_amount >= 0),
  -- Plafond hebdomadaire optionnel (NULL = non plafonné).
  weekly_cap  integer,
  category    text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reward_catalog select all" ON public.reward_catalog;
CREATE POLICY "reward_catalog select all"
  ON public.reward_catalog FOR SELECT
  USING (true);
-- Aucune policy write : le catalogue s'édite exclusivement par migration.

GRANT SELECT ON public.reward_catalog TO authenticated, anon;

-- Seed : les 4 sources déjà en production, montants inchangés.
INSERT INTO public.reward_catalog (source_key, xp_amount, weekly_cap, category, description)
VALUES
  ('workout_muscu',   100, NULL, 'session',  'Séance de musculation complétée (source primaire, non plafonnée)'),
  ('workout_support', 25,  75,   'session',  'Séance de soutien (HYROX/course/cardio/guidé), plafonnée par semaine'),
  ('pr_muscu',        50,  NULL, 'exercise', 'Nouveau record de charge en musculation, 1x/séance'),
  ('streak',          15,  NULL, 'session',  'Séance muscu avec activité la veille (fidélité)')
ON CONFLICT (source_key) DO NOTHING;

-- ── 2. `xp_events` : idempotence générique via `dedup_key` ────────────
-- Le couple (workout_id, source) ne couvre que les événements liés à une
-- séance. Les futures sources (PR d'exercice, Chronique, défi...) n'ont
-- pas de workout_id : `dedup_key` généralise l'idempotence (ex.
-- "exercise:<id>:pr_weight", "chronicle:<id>:discovered").
ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_source_dedup_key
  ON public.xp_events(source, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- ── 3. Verseur central : accepte désormais un dedup_key générique ─────
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

  -- Idempotence liée à une séance (chemin historique, inchangé).
  IF _workout_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.xp_events
      WHERE workout_id = _workout_id AND source = _source
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Idempotence générique (nouvelles sources sans workout_id).
  IF _dedup_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.xp_events
      WHERE source = _source AND dedup_key = _dedup_key
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.xp_events(user_id, source, amount, workout_id, dedup_key)
  VALUES (_user_id, _source, _amount, _workout_id, _dedup_key);

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

-- ── 4. LA RPC générique — un seul point d'entrée pour TOUTE source ────
-- Le client déclare l'événement (source_key whitelisté + dedup_key) ; le
-- serveur lit `reward_catalog` et décide seul du montant. Une source
-- inconnue ou inactive est ignorée silencieusement (defense-in-depth : le
-- client ne peut jamais forcer un versement hors catalogue).
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
  _user_id  uuid := auth.uid();
  _cat      public.reward_catalog%rowtype;
  _week_sum integer;
  _award    integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _cat FROM public.reward_catalog
  WHERE source_key = _source_key AND active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

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

  PERFORM public.award_character_xp(_user_id, _source_key, _award, _workout_id, _dedup_key);
END;
$$;

REVOKE ALL ON FUNCTION public.award_reward_event(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_reward_event(text, text, uuid) TO authenticated;

-- ── 5. Le trigger de séance lit désormais le catalogue, plus de constantes
--       codées en dur. Comportement observable strictement inchangé (mêmes
--       montants, même plafond) — seule la source de vérité change. ──────
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
  _xp_before     integer;
  _level_before  integer;
  _xp_after      integer;
  _level_after   integer;
  cat_muscu      public.reward_catalog%rowtype;
  cat_support    public.reward_catalog%rowtype;
  cat_pr         public.reward_catalog%rowtype;
  cat_streak     public.reward_catalog%rowtype;
BEGIN
  -- Uniquement à l'entrée dans l'état `completed`.
  IF NOT (
    NEW.status = 'completed'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cat_muscu FROM public.reward_catalog WHERE source_key = 'workout_muscu' AND active;
  SELECT * INTO cat_support FROM public.reward_catalog WHERE source_key = 'workout_support' AND active;
  SELECT * INTO cat_pr FROM public.reward_catalog WHERE source_key = 'pr_muscu' AND active;
  SELECT * INTO cat_streak FROM public.reward_catalog WHERE source_key = 'streak' AND active;

  SELECT xp, level INTO _xp_before, _level_before
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_before := COALESCE(_xp_before, 0);
  _level_before := COALESCE(_level_before, public.compute_level_from_xp(_xp_before));

  is_muscu := (COALESCE(NEW.discipline, 'muscu') = 'muscu');

  IF is_muscu THEN
    IF cat_muscu.source_key IS NOT NULL THEN
      PERFORM public.award_character_xp(NEW.user_id, 'workout_muscu', cat_muscu.xp_amount, NEW.id);
    END IF;

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

    IF has_pr AND cat_pr.source_key IS NOT NULL THEN
      PERFORM public.award_character_xp(NEW.user_id, 'pr_muscu', cat_pr.xp_amount, NEW.id);
    END IF;

    -- Streak (fidélité muscu) : veille avec séance complétée.
    SELECT EXISTS (
      SELECT 1 FROM public.workouts w3
      WHERE w3.user_id = NEW.user_id
        AND w3.status = 'completed'
        AND w3.id <> NEW.id
        AND w3.date::date = (NEW.date::date - 1)
    ) INTO had_prev_day;

    IF had_prev_day AND cat_streak.source_key IS NOT NULL THEN
      PERFORM public.award_character_xp(NEW.user_id, 'streak', cat_streak.xp_amount, NEW.id);
    END IF;

  ELSIF cat_support.source_key IS NOT NULL THEN
    -- Disciplines de soutien : plafond hebdomadaire lu depuis le catalogue.
    SELECT COALESCE(SUM(amount), 0) INTO support_week
    FROM public.xp_events
    WHERE user_id = NEW.user_id
      AND source = 'workout_support'
      AND created_at >= date_trunc('week', now());

    award := LEAST(cat_support.xp_amount, GREATEST(0, COALESCE(cat_support.weekly_cap, cat_support.xp_amount) - support_week));
    IF award > 0 THEN
      PERFORM public.award_character_xp(NEW.user_id, 'workout_support', award, NEW.id);
    END IF;
  END IF;

  SELECT xp, level INTO _xp_after, _level_after
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_after := COALESCE(_xp_after, _xp_before);
  _level_after := COALESCE(_level_after, public.compute_level_from_xp(_xp_after));

  UPDATE public.workouts
    SET xp_before = _xp_before, xp_after = _xp_after,
        level_before = _level_before, level_after = _level_after
    WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_xp_on_workout_complete()
  FROM PUBLIC, anon, authenticated;
