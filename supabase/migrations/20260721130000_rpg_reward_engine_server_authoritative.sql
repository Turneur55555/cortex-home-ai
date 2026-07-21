-- =====================================================================
-- RPG — Reward Engine 100% serveur-autoritaire (fin de toute confiance
-- cliente, même partielle).
--
-- 1) `exercise_rank_up` : l'ancienne RPC faisait confiance à la
--    classification du client (Titre déclaré). Nathan ne veut plus AUCUNE
--    confiance, même partielle : le serveur doit recalculer le Rang
--    lui-même. Reproduire le moteur de classification en SQL créerait
--    exactement le risque de dérive qui a déjà causé 3 bugs historiques
--    sur la courbe de Niveau (cf. migration 20260718120000) — et cette
--    fois-ci sans pouvoir exécuter la moindre requête SQL en direct dans
--    cet environnement pour la valider. À la place : une Edge Function
--    (`verify-exercise-rank`) réutilise une copie fidèle du VRAI moteur
--    TypeScript (`src/lib/fitness/rank/`) pour recalculer le Rang à partir
--    des données brutes, puis verse l'XP via le service role. Le client
--    n'envoie plus AUCUNE valeur calculée (ni Titre, ni tier, ni 1RM) —
--    seulement l'identité de l'exercice. Cette migration : retire l'ancienne
--    RPC cliente et accorde au service role ce qu'il faut pour verser l'XP.
--
-- 2) Achievements : `claim_achievement` faisait entièrement confiance au
--    client (ID + montant). Il fonctionne désormais comme les badges :
--    vérification serveur d'un critère réel avant tout versement. Les
--    familles de succès à seuil (`buildMilestoneSeries`, ID au format
--    "<prefix>_<tierIndex>_<seuil>") sont mappées à une statistique
--    calculable serveur via `achievement_criteria`. Un succès dont le
--    préfixe n'est PAS encore mappé ne verse RIEN (au lieu de faire
--    confiance au client) — aucune régression (il ne versait déjà rien
--    avant ce chantier), mais plus aucune confiance non plus.
-- =====================================================================

-- ── 1. Service role : verser l'XP depuis l'Edge Function ──────────────
GRANT EXECUTE ON FUNCTION public.award_character_xp(uuid, text, integer, uuid, text)
  TO service_role;

-- Ancienne RPC cliente (faisait confiance à `_titre_key` déclaré par le
-- client) : retirée, remplacée par l'Edge Function `verify-exercise-rank`.
DROP FUNCTION IF EXISTS public.award_exercise_rank_up(text, uuid, text, uuid);

-- ── 2. Statistiques étendues pour les Achievements ────────────────────
-- Étend `compute_fitness_stats` (badges, inchangée) avec les stats
-- supplémentaires nécessaires aux familles de succès mappées. Fonction
-- séparée pour ne prendre AUCUN risque sur le calcul des badges existant.
CREATE OR REPLACE FUNCTION public.compute_achievement_stats(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _base               jsonb;
  _distinct_months    int;
  _total_volume       numeric;
  _total_sets         int;
  _total_reps         numeric;
  _distinct_exercises int;
  _guided_count       int;
  _course_count       int;
BEGIN
  _base := public.compute_fitness_stats(_uid);

  SELECT COUNT(DISTINCT date_trunc('month', date)) INTO _distinct_months
    FROM public.workouts WHERE user_id = _uid;

  SELECT COALESCE(SUM(s.weight * s.reps), 0), COUNT(*), COALESCE(SUM(s.reps), 0)
    INTO _total_volume, _total_sets, _total_reps
    FROM public.exercise_sets s
    WHERE s.user_id = _uid;

  SELECT COUNT(DISTINCT COALESCE(e.exercise_reference_id::text, lower(btrim(e.name))))
    INTO _distinct_exercises
    FROM public.exercises e
    WHERE e.user_id = _uid;

  SELECT COUNT(*) INTO _guided_count
    FROM public.workouts WHERE user_id = _uid AND discipline = 'guided';
  SELECT COUNT(*) INTO _course_count
    FROM public.workouts WHERE user_id = _uid AND discipline = 'course';

  RETURN _base || jsonb_build_object(
    'distinct_months_active', _distinct_months,
    'total_volume_kg', _total_volume,
    'total_sets', _total_sets,
    'total_reps', _total_reps,
    'distinct_exercise_count', _distinct_exercises,
    'guided_sessions_count', _guided_count,
    'course_sessions_count', _course_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_achievement_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_achievement_stats(uuid) TO authenticated;

-- ── 3. Mapping "famille de succès à seuil" → statistique serveur ──────
-- `buildMilestoneSeries` (src/lib/profile/achievements/tierBuilder.ts)
-- génère des ID au format "<idPrefix>_<tierIndex>_<seuil>" — le seuil est
-- donc déjà porté par l'ID lui-même, pas besoin de dupliquer les paliers
-- ici. Seul le PRÉFIXE doit être mappé à une statistique.
CREATE TABLE IF NOT EXISTS public.achievement_criteria (
  id_prefix       text PRIMARY KEY,
  requirement_type text NOT NULL,
  description     text
);

ALTER TABLE public.achievement_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievement_criteria select all" ON public.achievement_criteria;
CREATE POLICY "achievement_criteria select all"
  ON public.achievement_criteria FOR SELECT
  USING (true);

GRANT SELECT ON public.achievement_criteria TO authenticated, anon;

-- Familles portées dans cette passe (mappage direct vers une stat déjà
-- calculable serveur). Familles NON listées ici (first_steps hors-tiers,
-- rpg_*, secret_*, collection_*, body_weight_change, recovery_weekly_streak,
-- hyrox_simulations, running "prep" booléens) restent NON server-vérifiées
-- → `claim_achievement` les rejette silencieusement (0 XP, comme avant ce
-- chantier — aucune régression). À porter au fil de l'eau : ajouter une
-- ligne ici (+ éventuellement une stat dans `compute_achievement_stats`)
-- suffit, sans toucher `claim_achievement`.
INSERT INTO public.achievement_criteria (id_prefix, requirement_type, description) VALUES
  ('endurance_workouts',            'workouts_count',          'Nombre total de séances'),
  ('endurance_streak',              'streak_days',             'Série de jours actifs consécutifs'),
  ('endurance_months_active',       'distinct_months_active',  'Nombre de mois distincts actifs'),
  ('strength_total_volume',         'total_volume_kg',         'Tonnage total soulevé (carrière)'),
  ('hyper_sets',                    'total_sets',               'Nombre total de séries'),
  ('hyper_reps',                    'total_reps',               'Nombre total de répétitions'),
  ('exploration_distinct_exercises','distinct_exercise_count', 'Nombre d''exercices distincts pratiqués'),
  ('nutrition_protein_days',        'protein_days',             'Jours d''objectif protéines atteint (30j)'),
  ('body_measurements',             'body_measurements',        'Nombre de mensurations enregistrées'),
  ('guided_sessions',                'guided_sessions_count',   'Nombre de séances accompagnées'),
  ('running_sessions',               'course_sessions_count',   'Nombre de séances de course'),
  ('recovery_weekly_target',         'weekly_workouts',         'Séances complétées cette semaine')
ON CONFLICT (id_prefix) DO NOTHING;

-- ── 4. `claim_achievement` — vérification serveur, comme les badges ───
CREATE OR REPLACE FUNCTION public.claim_achievement(_achievement_id text, _xp_reward integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id   uuid := auth.uid();
  _amount    integer;
  _match     text[];
  _prefix    text;
  _threshold numeric;
  _criteria  public.achievement_criteria%rowtype;
  _stats     jsonb;
  _current   numeric;
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

  -- Format généré par buildMilestoneSeries : "<prefix>_<tierIndex>_<seuil>".
  _match := regexp_match(_achievement_id, '^(.+)_(\d+)_(\d+(?:\.\d+)?)$');
  IF _match IS NULL THEN
    RETURN; -- succès non-tiered (defineAchievement) : pas encore porté, 0 XP
  END IF;

  _prefix := _match[1];
  _threshold := _match[3]::numeric;

  SELECT * INTO _criteria FROM public.achievement_criteria WHERE id_prefix = _prefix;
  IF NOT FOUND THEN
    RETURN; -- famille non encore mappée côté serveur : 0 XP, pas de confiance
  END IF;

  _stats := public.compute_achievement_stats(_user_id);
  _current := COALESCE((_stats->>_criteria.requirement_type)::numeric, 0);

  IF _current < _threshold THEN
    RETURN; -- critère non réellement atteint : réclamation rejetée
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
