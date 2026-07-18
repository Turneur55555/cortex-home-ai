-- =====================================================================
-- RPG — Corrections d'intégrité du Niveau de Personnage (Niveaux + Rangs).
--
-- Contexte (audit) : l'historique des migrations a fait diverger
-- `compute_level_from_xp` trois fois (50529061501 → /50+1, 20260602083143
-- → /50+1 de nouveau, 20260704110408 → /100 SANS +1) alors que le client
-- (`characterLevel.ts`) et la doc (`rpg-vision-et-r1-niveau-personnage.md`
-- ligne 50/227) sont restés alignés sur `sqrt(xp/50)+1`. Par ailleurs, deux
-- couples de triggers redondants versaient l'XP EN DOUBLE (badges, objectifs)
-- avec des formules de niveau dupliquées et divergentes. Enfin, supprimer ou
-- rouvrir une séance complétée ne retirait jamais l'XP déjà versée.
--
-- Ce fichier :
--   1) restaure la SEULE formule de niveau canonique (miroir client) ;
--   2) ajoute un garde-fou serveur qui garantit l'invariant
--      user_stats.level == compute_level_from_xp(user_stats.xp) sur TOUTE
--      écriture, quel que soit l'écrivain ;
--   3) supprime les doubles-versements d'XP (badges, objectifs) ;
--   4) retire l'XP d'une séance supprimée ou repassée hors `completed` ;
--   5) fait de `workouts` la source de vérité pour l'écran de récompense
--      (xp_before/xp_after/level_before/level_after), au lieu de la
--      reconstruction fragile côté client (xpAfter − Σ events).
-- =====================================================================

-- ── 1. Formule canonique unique : sqrt(xp/50)+1 (miroir exact du client) ──
CREATE OR REPLACE FUNCTION public.compute_level_from_xp(_xp integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 50.0))::int + 1);
$function$;

-- ── 2. Garde-fou : le niveau est TOUJOURS dérivé de l'XP, quel que soit
--       l'écrivain (present ou futur). Défense en profondeur : même si une
--       future fonction oublie d'appeler compute_level_from_xp, ou utilise
--       une formule inline erronée, ce trigger corrige avant écriture. ──
CREATE OR REPLACE FUNCTION public.enforce_level_from_xp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.level := public.compute_level_from_xp(NEW.xp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_level_from_xp ON public.user_stats;
CREATE TRIGGER trg_enforce_level_from_xp
BEFORE INSERT OR UPDATE OF xp ON public.user_stats
FOR EACH ROW EXECUTE FUNCTION public.enforce_level_from_xp();

-- Recalcul immédiat : toute XP déjà accumulée doit refléter la formule
-- canonique restaurée (certains user_stats.level ont pu dériver via les
-- formules /100 ou les recalculs one-off divergents).
UPDATE public.user_stats
SET level = public.compute_level_from_xp(xp)
WHERE level IS DISTINCT FROM public.compute_level_from_xp(xp);

-- ── 3a. Badges : suppression du double-versement ──────────────────────
-- `unlock_user_badge` upsertait `user_stats` DIRECTEMENT en plus de
-- l'INSERT dans `user_badges`, qui déclenche déjà `trg_award_xp_on_badge`
-- (AFTER INSERT, `award_xp_on_badge`, seule fonction habilitée à écrire
-- l'XP d'un badge). Résultat : xp_reward versé deux fois par badge
-- débloqué. Un seul écrivain désormais : le trigger.
--
-- `unlock_user_badge` a changé de type de retour à plusieurs reprises
-- dans l'historique (`user_badges` puis `void`) — `CREATE OR REPLACE
-- FUNCTION` ne peut PAS changer le type de retour d'une fonction existante
-- (erreur Postgres bloquante). Le DROP explicite rend cette migration
-- exécutable quel que soit le type de retour actuellement en place.
DROP FUNCTION IF EXISTS public.unlock_user_badge(text);
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

  -- Validation serveur : le critère doit être réellement atteint.
  _stats := compute_fitness_stats(_user_id);
  _current := coalesce((_stats->>_badge.requirement_type)::numeric, 0);
  IF _current < _badge.requirement_value THEN
    RAISE EXCEPTION 'Criteria not met for %: % < %', _badge_key, _current, _badge.requirement_value;
  END IF;

  -- L'XP est versée exclusivement par `trg_award_xp_on_badge`
  -- (AFTER INSERT ON user_badges) — ne PAS toucher user_stats ici.
  INSERT INTO user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  VALUES (_user_id, _badge.badge_key, _badge.label, _badge.icon, _badge.rarity, _badge.xp_reward, _badge.description)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Le DROP FUNCTION ci-dessus efface les privilèges précédemment accordés
-- (20260607103913 / 20260630135437) — ré-appliqués à l'identique pour ne
-- pas régresser la posture de sécurité (PUBLIC/anon ne doivent jamais
-- pouvoir appeler cette fonction SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.unlock_user_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;

-- ── 3b. Objectifs : suppression du double-versement + de l'exploit de
--       bascule (is_completed true→false→true réattribuait l'XP à chaque
--       aller-retour, faute de garde d'idempotence sur l'ancien trigger
--       AFTER). Un seul trigger BEFORE, idempotent via `xp_awarded`. ──
DROP TRIGGER IF EXISTS trg_award_xp_on_goal_complete ON public.goals;
DROP FUNCTION IF EXISTS public.award_xp_on_goal_complete();

CREATE OR REPLACE FUNCTION public.award_goal_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_xp   integer;
  awarded  integer;
BEGIN
  IF NEW.is_completed = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_completed, false) = false)
     AND NOT COALESCE(NEW.xp_awarded, false) THEN
    NEW.xp_awarded := true;

    -- Plafond défensif contre une valeur xp_reward gonflée côté client.
    awarded := LEAST(GREATEST(COALESCE(NEW.xp_reward, 0), 0), 500);

    INSERT INTO public.user_stats (user_id, xp, level, total_actions)
    VALUES (NEW.user_id, awarded, 1, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET xp            = public.user_stats.xp + awarded,
          total_actions = public.user_stats.total_actions + 1,
          updated_at    = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_award_xp ON public.goals;
CREATE TRIGGER goals_award_xp
  BEFORE INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.award_goal_xp();

REVOKE EXECUTE ON FUNCTION public.award_goal_xp() FROM PUBLIC, anon, authenticated;

-- ── 4. Séance supprimée / repassée hors `completed` → XP retirée ──────
-- Verseur inverse : source unique de retrait d'XP pour un workout_id donné.
CREATE OR REPLACE FUNCTION public.revoke_character_xp_for_workout(_workout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _total   integer;
BEGIN
  SELECT user_id, SUM(amount) INTO _user_id, _total
  FROM public.xp_events
  WHERE workout_id = _workout_id
  GROUP BY user_id;

  IF _total IS NULL OR _total <= 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.xp_events WHERE workout_id = _workout_id;

  UPDATE public.user_stats
    SET xp         = GREATEST(0, xp - _total),
        updated_at = now()
    WHERE user_id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_character_xp_for_workout(uuid)
  FROM PUBLIC, anon, authenticated;

-- 4a. Suppression d'une séance (DELETE) : XP retirée AVANT que la ligne ne
-- disparaisse (BEFORE DELETE, pendant que xp_events.workout_id est encore
-- valide — les xp_events sont explicitement supprimés ici, la clause
-- `ON DELETE SET NULL` de la FK devient un filet de sécurité sans effet).
CREATE OR REPLACE FUNCTION public.reverse_xp_before_workout_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.revoke_character_xp_for_workout(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_xp_before_workout_delete ON public.workouts;
CREATE TRIGGER trg_reverse_xp_before_workout_delete
BEFORE DELETE ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.reverse_xp_before_workout_delete();

-- 4b. Séance repassée hors `completed` (ex. completed → active, ré-ouverture) :
-- même retrait, et les compteurs xp_before/après de la séance (voir §5) sont
-- effacés puisqu'ils ne décrivent plus une récompense valide.
CREATE OR REPLACE FUNCTION public.reverse_xp_on_workout_uncomplete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.revoke_character_xp_for_workout(OLD.id);
    UPDATE public.workouts
      SET xp_before = NULL, xp_after = NULL, level_before = NULL, level_after = NULL
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_xp_on_workout_uncomplete ON public.workouts;
CREATE TRIGGER trg_reverse_xp_on_workout_uncomplete
AFTER UPDATE OF status ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.reverse_xp_on_workout_uncomplete();

REVOKE EXECUTE ON FUNCTION public.reverse_xp_before_workout_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_xp_on_workout_uncomplete()
  FROM PUBLIC, anon, authenticated;

-- ── 5. Session Reward : le serveur devient la source de vérité ───────
-- Le client reconstruisait `xpBefore = xpAfter − Σ(events de la séance)`,
-- fragile (suppose que `user_stats.xp` n'a pas bougé depuis, ignore les
-- autres sources d'XP concurrentes). Le serveur trace désormais l'état
-- avant/après DIRECTEMENT au moment de l'attribution.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS xp_before integer,
  ADD COLUMN IF NOT EXISTS xp_after integer,
  ADD COLUMN IF NOT EXISTS level_before integer,
  ADD COLUMN IF NOT EXISTS level_after integer;

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

  SELECT xp, level INTO _xp_before, _level_before
  FROM public.user_stats WHERE user_id = NEW.user_id;
  _xp_before := COALESCE(_xp_before, 0);
  _level_before := COALESCE(_level_before, public.compute_level_from_xp(_xp_before));

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
