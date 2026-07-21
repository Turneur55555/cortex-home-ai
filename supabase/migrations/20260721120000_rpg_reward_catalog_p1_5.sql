-- =====================================================================
-- RPG P1.5 — Le Reward Catalog devient l'unique source de vérité des
-- récompenses XP de CORTEX.
--
-- Contenu (validé par Nathan) :
--   1) Rendement décroissant générique (`diminishing_group`/`diminishing_curve`
--      sur `reward_catalog`) — pas de plafond brutal, le gain diminue
--      progressivement (100% / 80% / 60% / 40% puis plancher).
--   2) Records par exercice (poids / répétitions / volume / 1RM estimé),
--      détectés 100% serveur à la clôture de séance (même patron de
--      confiance que `pr_muscu` existant — aucune valeur venant du client).
--      Chaque type reste une source distincte (pas de fusion, décision
--      explicite de Nathan) mais partage le même groupe de décroissance
--      ('exercise_progress') pour éviter le cumul de 4 bonus pleins sur le
--      même exercice le même jour.
--   3) `exercise_rank_up` sécurisé côté serveur SANS reproduire le moteur de
--      classification par famille (`rank/engine.ts`, qui reste la SEULE
--      source de vérité du Titre atteint — le dupliquer en SQL créerait
--      exactement le risque de dérive qui a déjà causé 3 bugs historiques
--      sur la courbe de Niveau, cf. migration 20260718120000). À la place :
--      le serveur exige une preuve vérifiable de progression réelle (un
--      nouveau meilleur 1RM estimé sur CET exercice, dans CETTE séance,
--      comparé à tout l'historique complété) avant de verser quoi que ce
--      soit ; le client reste seul juge de QUEL Titre cette progression
--      représente (classification, pas fabrication de valeur).
--   4) Badges et objectifs migrés vers le grand livre `xp_events` (ils
--      écrivaient `user_stats` directement, en dehors du ledger) — mêmes
--      montants, mêmes règles, juste tracés désormais comme toute autre
--      source.
--   5) Persistance des Achievements (`user_achievements`) — jusqu'ici
--      recalculés en direct côté client, jamais persistés, `xpReward`
--      jamais versé. Limite assumée : les critères des ~196 succès ne sont
--      pas revalidés serveur (contrairement aux badges) ; le montant est
--      borné (`LEAST(_xp_reward, 1000)`, plafond déjà en vigueur pour le
--      palier de succès le plus généreux) et l'idempotence est garantie par
--      la contrainte unique. Renforcement possible plus tard si nécessaire.
--
-- Ne touche NI le moteur Rang/Maîtrise par exercice NI les Saisons.
-- =====================================================================

-- ── 1. Rendement décroissant générique ────────────────────────────────
ALTER TABLE public.reward_catalog
  ADD COLUMN IF NOT EXISTS diminishing_group text,
  ADD COLUMN IF NOT EXISTS diminishing_curve integer[];

CREATE INDEX IF NOT EXISTS reward_catalog_diminishing_group_idx
  ON public.reward_catalog(diminishing_group)
  WHERE diminishing_group IS NOT NULL;

-- Verse un montant réduit selon la position (0-based) dans le groupe de
-- décroissance cette semaine. Dernière valeur de la courbe = plancher.
CREATE OR REPLACE FUNCTION public.award_diminishing_reward(
  _user_id         uuid,
  _source_key      text,
  _dedup_key       text,
  _occurrence_index integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cat        public.reward_catalog%rowtype;
  _pct        integer;
  _curve_len  integer;
  _amount     integer;
BEGIN
  SELECT * INTO _cat FROM public.reward_catalog WHERE source_key = _source_key AND active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF _cat.diminishing_curve IS NULL OR array_length(_cat.diminishing_curve, 1) IS NULL THEN
    _pct := 100;
  ELSE
    _curve_len := array_length(_cat.diminishing_curve, 1);
    _pct := _cat.diminishing_curve[LEAST(GREATEST(_occurrence_index, 0) + 1, _curve_len)];
  END IF;

  _amount := GREATEST(0, ROUND(_cat.xp_amount * _pct / 100.0)::integer);
  IF _amount <= 0 THEN
    RETURN;
  END IF;

  -- workout_id volontairement NULL : plusieurs exercices distincts de LA
  -- MÊME séance peuvent tous réclamer la MÊME source_key ; l'idempotence
  -- vient uniquement du dedup_key (unique par exercice/métrique/séance).
  PERFORM public.award_character_xp(_user_id, _source_key, _amount, NULL, _dedup_key);
END;
$$;

REVOKE ALL ON FUNCTION public.award_diminishing_reward(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;

-- ── 2. Seed du catalogue — records par exercice + rang par exercice ───
INSERT INTO public.reward_catalog (source_key, xp_amount, weekly_cap, category, diminishing_group, diminishing_curve, description)
VALUES
  ('exercise_weight_record', 30, NULL, 'exercise', 'exercise_progress', ARRAY[100,80,60,40],
    'Nouveau record de charge sur un exercice précis (détecté à la clôture de séance)'),
  ('exercise_reps_record',   30, NULL, 'exercise', 'exercise_progress', ARRAY[100,80,60,40],
    'Nouveau record de répétitions sur un exercice précis'),
  ('exercise_volume_record', 30, NULL, 'exercise', 'exercise_progress', ARRAY[100,80,60,40],
    'Nouveau record de volume (tonnage de la séance) sur un exercice précis'),
  ('exercise_1rm_record',    30, NULL, 'exercise', 'exercise_progress', ARRAY[100,80,60,40],
    'Amélioration du 1RM estimé (Epley) sur un exercice précis'),
  ('exercise_rank_up_mortel',     20,  NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Mortel'),
  ('exercise_rank_up_guerrier',   40,  NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Guerrier'),
  ('exercise_rank_up_heros',      70,  NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Héros'),
  ('exercise_rank_up_titan',      120, NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Titan'),
  ('exercise_rank_up_olympien',   200, NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Olympien'),
  ('exercise_rank_up_primordial', 350, NULL, 'exercise', NULL, NULL, 'Montée de Rang par exercice — famille Primordial')
ON CONFLICT (source_key) DO NOTHING;

-- ── 3. `award_exercise_rank_up` — preuve serveur, classification cliente ──
-- Le client déclare avoir constaté une montée de Rang vers `_titre_key` sur
-- un exercice. Le serveur n'essaie PAS de reproduire le moteur de
-- classification (family/boundaries/confirmation gates) : il exige la
-- preuve minimale mais suffisante qu'une amélioration réelle a eu lieu —
-- un nouveau meilleur 1RM estimé sur CET exercice, dans CETTE séance,
-- au-delà de tout l'historique complété de l'utilisateur. Sans cette
-- preuve, la réclamation est silencieusement ignorée (aucune XP versée).
-- `_workout_id` est optionnel : le point de détection existant
-- (`ExerciseRankCard`, ouverture de la fiche exercice) ne connaît que le nom
-- de l'exercice, pas une séance précise. Si absent, l'ancre devient la
-- dernière séance complétée contenant cet exercice ; le reste de
-- l'historique complété sert de référence pour prouver l'amélioration.
CREATE OR REPLACE FUNCTION public.award_exercise_rank_up(
  _titre_key              text,
  _exercise_reference_id  uuid,
  _exercise_name          text,
  _workout_id             uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id        uuid := auth.uid();
  _source         text := 'exercise_rank_up_' || _titre_key;
  _cat            public.reward_catalog%rowtype;
  _anchor_id      uuid;
  _anchor_date    timestamptz;
  _cur_1rm        numeric;
  _hist_1rm       numeric;
  _exercise_key   text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _cat FROM public.reward_catalog WHERE source_key = _source AND active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF _workout_id IS NOT NULL THEN
    SELECT id, created_at INTO _anchor_id, _anchor_date
    FROM public.workouts
    WHERE id = _workout_id AND user_id = _user_id AND status = 'completed';
  ELSE
    SELECT w.id, w.created_at INTO _anchor_id, _anchor_date
    FROM public.workouts w
    JOIN public.exercises e ON e.workout_id = w.id
    WHERE w.user_id = _user_id
      AND w.status = 'completed'
      AND (
        (_exercise_reference_id IS NOT NULL AND e.exercise_reference_id = _exercise_reference_id)
        OR (_exercise_reference_id IS NULL AND lower(btrim(e.name)) = lower(btrim(_exercise_name)))
      )
    ORDER BY w.created_at DESC
    LIMIT 1;
  END IF;

  IF _anchor_id IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(CASE WHEN s.weight IS NOT NULL AND s.reps IS NOT NULL AND s.reps > 0
                  THEN s.weight * (1 + s.reps / 30.0) END)
    INTO _cur_1rm
    FROM public.exercises e
    JOIN public.exercise_sets s ON s.exercise_id = e.id
    WHERE e.workout_id = _anchor_id
      AND (
        (_exercise_reference_id IS NOT NULL AND e.exercise_reference_id = _exercise_reference_id)
        OR (_exercise_reference_id IS NULL AND lower(btrim(e.name)) = lower(btrim(_exercise_name)))
      );

  IF _cur_1rm IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(CASE WHEN s2.weight IS NOT NULL AND s2.reps IS NOT NULL AND s2.reps > 0
                  THEN s2.weight * (1 + s2.reps / 30.0) END)
    INTO _hist_1rm
    FROM public.exercises e2
    JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
    JOIN public.workouts w2 ON w2.id = e2.workout_id
    WHERE w2.user_id = _user_id
      AND w2.status = 'completed'
      AND w2.id <> _anchor_id
      AND w2.created_at < _anchor_date
      AND (
        (_exercise_reference_id IS NOT NULL AND e2.exercise_reference_id = _exercise_reference_id)
        OR (_exercise_reference_id IS NULL AND lower(btrim(e2.name)) = lower(btrim(_exercise_name)))
      );

  IF _cur_1rm <= COALESCE(_hist_1rm, 0) THEN
    RETURN; -- aucune amélioration réelle prouvée : réclamation ignorée
  END IF;

  _exercise_key := COALESCE(_exercise_reference_id::text, lower(btrim(_exercise_name)));

  PERFORM public.award_character_xp(
    _user_id, _source, _cat.xp_amount, NULL,
    'exercise_rank_up:' || _anchor_id::text || ':' || _exercise_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_exercise_rank_up(text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_exercise_rank_up(text, uuid, text, uuid) TO authenticated;

-- ── 4. Records par exercice à la clôture de séance (même confiance que
--       `pr_muscu` : tout est recalculé depuis `exercise_sets`, zéro valeur
--       cliente). Ajouté à `award_xp_on_workout_complete`, muscu uniquement. ──
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
  ex_rec         record;
  cur_weight     numeric;
  cur_reps       integer;
  cur_volume     numeric;
  cur_1rm        numeric;
  hist_weight    numeric;
  hist_reps      integer;
  hist_1rm       numeric;
  hist_volume    numeric;
  exercise_key   text;
  progress_count integer;
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

    -- PR muscu (séance) : inchangé, comportement legacy conservé tel quel.
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

    -- Records par exercice (poids / reps / volume / 1RM), rendement
    -- décroissant partagé ('exercise_progress'). Compteur de position
    -- initialisé sur les events de la semaine, incrémenté en mémoire à
    -- chaque record accordé dans CETTE boucle (plusieurs records dans la
    -- même séance comptent bien comme des occurrences successives).
    SELECT COUNT(*) INTO progress_count
    FROM public.xp_events xe
    JOIN public.reward_catalog rc ON rc.source_key = xe.source
    WHERE xe.user_id = NEW.user_id
      AND rc.diminishing_group = 'exercise_progress'
      AND xe.created_at >= date_trunc('week', now());

    FOR ex_rec IN
      SELECT e.id AS exercise_id, e.exercise_reference_id, e.name
      FROM public.exercises e
      WHERE e.workout_id = NEW.id
    LOOP
      SELECT
        MAX(s.weight),
        MAX(s.reps),
        COALESCE(SUM(s.weight * s.reps), 0),
        MAX(CASE WHEN s.weight IS NOT NULL AND s.reps IS NOT NULL AND s.reps > 0
                 THEN s.weight * (1 + s.reps / 30.0) END)
      INTO cur_weight, cur_reps, cur_volume, cur_1rm
      FROM public.exercise_sets s
      WHERE s.exercise_id = ex_rec.exercise_id;

      SELECT
        MAX(s2.weight),
        MAX(s2.reps),
        MAX(CASE WHEN s2.weight IS NOT NULL AND s2.reps IS NOT NULL AND s2.reps > 0
                 THEN s2.weight * (1 + s2.reps / 30.0) END)
      INTO hist_weight, hist_reps, hist_1rm
      FROM public.exercises e2
      JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
      JOIN public.workouts w2 ON w2.id = e2.workout_id
      WHERE w2.user_id = NEW.user_id
        AND w2.status = 'completed'
        AND w2.id <> NEW.id
        AND w2.created_at < NEW.created_at
        AND (
          (ex_rec.exercise_reference_id IS NOT NULL AND e2.exercise_reference_id = ex_rec.exercise_reference_id)
          OR (ex_rec.exercise_reference_id IS NULL AND lower(btrim(e2.name)) = lower(btrim(ex_rec.name)))
        );

      SELECT MAX(session_vol) INTO hist_volume FROM (
        SELECT w2.id, SUM(s2.weight * s2.reps) AS session_vol
        FROM public.exercises e2
        JOIN public.exercise_sets s2 ON s2.exercise_id = e2.id
        JOIN public.workouts w2 ON w2.id = e2.workout_id
        WHERE w2.user_id = NEW.user_id
          AND w2.status = 'completed'
          AND w2.id <> NEW.id
          AND w2.created_at < NEW.created_at
          AND (
            (ex_rec.exercise_reference_id IS NOT NULL AND e2.exercise_reference_id = ex_rec.exercise_reference_id)
            OR (ex_rec.exercise_reference_id IS NULL AND lower(btrim(e2.name)) = lower(btrim(ex_rec.name)))
          )
        GROUP BY w2.id
      ) sub;

      exercise_key := COALESCE(ex_rec.exercise_reference_id::text, lower(btrim(ex_rec.name)));

      IF cur_weight IS NOT NULL AND cur_weight > COALESCE(hist_weight, 0) THEN
        PERFORM public.award_diminishing_reward(
          NEW.user_id, 'exercise_weight_record',
          'exercise_weight_record:' || NEW.id::text || ':' || exercise_key,
          progress_count
        );
        progress_count := progress_count + 1;
      END IF;

      IF cur_reps IS NOT NULL AND cur_reps > COALESCE(hist_reps, 0) THEN
        PERFORM public.award_diminishing_reward(
          NEW.user_id, 'exercise_reps_record',
          'exercise_reps_record:' || NEW.id::text || ':' || exercise_key,
          progress_count
        );
        progress_count := progress_count + 1;
      END IF;

      IF cur_volume > COALESCE(hist_volume, 0) AND cur_volume > 0 THEN
        PERFORM public.award_diminishing_reward(
          NEW.user_id, 'exercise_volume_record',
          'exercise_volume_record:' || NEW.id::text || ':' || exercise_key,
          progress_count
        );
        progress_count := progress_count + 1;
      END IF;

      IF cur_1rm IS NOT NULL AND cur_1rm > COALESCE(hist_1rm, 0) THEN
        PERFORM public.award_diminishing_reward(
          NEW.user_id, 'exercise_1rm_record',
          'exercise_1rm_record:' || NEW.id::text || ':' || exercise_key,
          progress_count
        );
        progress_count := progress_count + 1;
      END IF;
    END LOOP;

  ELSIF cat_support.source_key IS NOT NULL THEN
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

-- ── 5. Badges et objectifs migrés vers le ledger `xp_events` ──────────
-- Même montant (`badges_catalog.xp_reward`), mêmes garanties d'idempotence
-- (déblocage unique déjà garanti par `user_badges`), mais désormais tracé
-- dans `xp_events` comme toute autre source — plus d'écriture directe sur
-- `user_stats` en dehors du ledger central.
CREATE OR REPLACE FUNCTION public.unlock_user_badge(_badge_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _badge   badges_catalog%rowtype;
  _stats   jsonb;
  _current numeric;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _badge FROM badges_catalog WHERE badge_key = _badge_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Badge not found: %', _badge_key;
  END IF;

  IF EXISTS(SELECT 1 FROM user_badges WHERE user_id = _user_id AND badge_key = _badge_key) THEN
    RETURN;
  END IF;

  _stats := compute_fitness_stats(_user_id);
  _current := coalesce((_stats->>_badge.requirement_type)::numeric, 0);
  IF _current < _badge.requirement_value THEN
    RAISE EXCEPTION 'Criteria not met for %: % < %', _badge_key, _current, _badge.requirement_value;
  END IF;

  INSERT INTO user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  VALUES (_user_id, _badge.badge_key, _badge.label, _badge.icon, _badge.rarity, _badge.xp_reward, _badge.description)
  ON CONFLICT DO NOTHING;

  PERFORM public.award_character_xp(
    _user_id, 'badge_' || _badge.badge_key, COALESCE(_badge.xp_reward, 0), NULL,
    'badge:' || _badge.badge_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_user_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_goal_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  awarded integer;
BEGIN
  IF NEW.is_completed = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_completed, false) = false)
     AND NOT COALESCE(NEW.xp_awarded, false) THEN
    NEW.xp_awarded := true;

    awarded := LEAST(GREATEST(COALESCE(NEW.xp_reward, 0), 0), 500);

    PERFORM public.award_character_xp(
      NEW.user_id, 'goal_' || NEW.id::text, awarded, NULL,
      'goal:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_goal_xp() FROM PUBLIC, anon, authenticated;

-- ── 6. Persistance des Achievements ───────────────────────────────────
-- Jusqu'ici recalculés en direct côté client (~196 définitions,
-- `src/lib/profile/achievements/`), jamais persistés : `xpReward` n'était
-- jamais versé. Limite assumée (contrairement aux badges) : les critères
-- ne sont pas revalidés serveur ici — seuls l'idempotence (contrainte
-- unique) et un plafond dur (1000, le palier de succès le plus généreux
-- existant) protègent contre l'abus. Renforcement possible plus tard en
-- portant `compute_fitness_stats`-like vers les critères des succès.
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  xp_reward      integer NOT NULL DEFAULT 0,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements select own" ON public.user_achievements;
CREATE POLICY "user_achievements select own"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON public.user_achievements TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_achievement(_achievement_id text, _xp_reward integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _amount  integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _achievement_id IS NULL OR btrim(_achievement_id) = '' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = _user_id AND achievement_id = _achievement_id
  ) THEN
    RETURN;
  END IF;

  _amount := LEAST(GREATEST(COALESCE(_xp_reward, 0), 0), 1000);

  INSERT INTO public.user_achievements (user_id, achievement_id, xp_reward)
  VALUES (_user_id, _achievement_id, _amount)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  PERFORM public.award_character_xp(
    _user_id, 'achievement_' || _achievement_id, _amount, NULL,
    'achievement:' || _achievement_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievement(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement(text, integer) TO authenticated;
