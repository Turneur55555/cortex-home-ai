-- =====================================================================
-- RPG — Correctif d'urgence : `unlock_user_badge` ne versait plus AUCUNE
-- XP après la migration 20260718120000.
--
-- Cette dernière supposait que `trg_award_xp_on_badge` (AFTER INSERT ON
-- user_badges, défini dans la migration historique 20260529061501) était
-- l'écrivain actif et retirait donc l'upsert direct de `unlock_user_badge`
-- pour éliminer un double-versement. Vérification post-déploiement sur la
-- base réelle : ni `trg_award_xp_on_badge` ni la fonction
-- `award_xp_on_badge()` n'existent sur ce projet (écart entre l'historique
-- de fichiers locaux et l'état réel de la base — cause exacte non
-- déterminée, hors périmètre). `unlock_user_badge` était donc le SEUL
-- écrivain d'XP pour les badges ; l'avoir neutralisé a mis l'attribution
-- d'XP à zéro pour tout déblocage de badge.
--
-- Correctif : `unlock_user_badge` redevient auto-suffisant (seul
-- écrivain, aucune dépendance à un trigger externe dont l'existence ne
-- peut plus être supposée). Idempotence de déblocage déjà garantie par le
-- test `EXISTS` sur user_badges en amont de l'upsert.
-- =====================================================================

-- Filet de sécurité : si un trigger/fonction fantôme réapparaissait un
-- jour (migration future, restauration), il ne doit JAMAIS coexister avec
-- l'upsert direct ci-dessous (double-versement).
DROP TRIGGER IF EXISTS trg_award_xp_on_badge ON public.user_badges;
DROP FUNCTION IF EXISTS public.award_xp_on_badge();

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
  _new_xp  integer;
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

  INSERT INTO user_badges (user_id, badge_key, label, icon, rarity, xp_reward, description)
  VALUES (_user_id, _badge.badge_key, _badge.label, _badge.icon, _badge.rarity, _badge.xp_reward, _badge.description)
  ON CONFLICT DO NOTHING;

  -- Écrivain UNIQUE de l'XP badge (aucun trigger externe supposé exister).
  INSERT INTO public.user_stats (user_id, xp, level, total_actions)
  VALUES (_user_id, COALESCE(_badge.xp_reward, 0), 1, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET xp            = public.user_stats.xp + COALESCE(_badge.xp_reward, 0),
        total_actions = public.user_stats.total_actions + 1,
        updated_at    = now()
  RETURNING xp INTO _new_xp;
  -- `trg_enforce_level_from_xp` (migration 20260718120000) recalcule déjà
  -- `level` sur cette écriture ; pas de mise à jour manuelle nécessaire.
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_user_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_user_badge(text) TO authenticated;
