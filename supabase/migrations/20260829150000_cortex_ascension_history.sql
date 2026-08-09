-- =====================================================================
-- Historique des Ascensions — nouveau moteur RPG (29/08/2026).
--
-- Contexte : `rank_promotions` était alimentée par un trigger sur
-- `user_stats.xp` (supprimé migration 20260829120000, "chemin concurrent
-- XP → Titre"). Le Titre est désormais dérivé de la Puissance Cortex
-- (Performance → Rang exercice → Rang musculaire → Puissance Cortex),
-- calculée côté client (`useCortexPower`, `src/lib/fitness/rpg/
-- cortexPower.ts` — AUCUN changement à cette formule ici, cf. consigne).
--
-- Une "Ascension" est STRICTEMENT un changement de TITRE (Mortel→Guerrier
-- →Héros→Colosse→Olympien→Titan, 5 transitions), pas un changement de
-- grade au sein d'un même Titre (contrairement à `rank_promotions` qui
-- consignait les 30 paliers). Table SÉPARÉE et NOUVELLE, pas une
-- réutilisation de `rank_promotions` : `rank_promotions` reste intacte,
-- son historique (29 lignes) reste lisible tel quel, elle ne reçoit plus
-- aucune écriture (trigger déjà supprimé) — pas de destruction, pas de
-- double écriture, une seule table vivante pour le nouveau système.
--
-- Sécurité de l'écriture (compromis explicite, documenté) : calculer la
-- Puissance Cortex nécessite de rejouer toute la chaîne Rang exercice →
-- Rang musculaire → Puissance Cortex, aujourd'hui implémentée en TypeScript
-- pur côté client (pas de mirroir SQL — contrairement au moteur de Rang
-- par exercice, qui a un mirroir Deno dans l'edge function
-- `verify-exercise-rank`). Reconstruire ce mirroir pour 3 couches de calcul
-- supplémentaires est un chantier à part entière, non fait ici. En
-- attendant : le client soumet le SEUL palier (`tier_index`, 0-29) qu'il
-- vient de calculer, et le serveur applique deux garde-fous qui limitent
-- fortement la portée d'un abus :
--   1. progression strictement croissante (un tier_index inférieur ou égal
--      au maximum déjà enregistré est silencieusement ignoré — un Titre ne
--      peut jamais être "désascensionné" ni ré-enregistré) ;
--   2. l'insertion n'a lieu QUE si le nouveau tier_index correspond à un
--      changement de TITRE (floor(tier/5) supérieur au Titre déjà
--      enregistré) — un client ne peut pas spammer des lignes à chaque
--      micro-changement.
-- Un client malveillant pourrait donc, au pire, s'auto-attribuer un Titre
-- non mérité en avance — un risque de prestige, pas d'intégrité de
-- données fitness (aucune table de performance n'est touchée). Documenté
-- comme dette explicite (voir rapport de session), pas masqué.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cortex_ascensions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_index           smallint NOT NULL CHECK (tier_index BETWEEN 0 AND 29),
  previous_tier_index  smallint CHECK (previous_tier_index IS NULL OR previous_tier_index BETWEEN 0 AND 29),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier_index)
);

ALTER TABLE public.cortex_ascensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cortex_ascensions_select_own" ON public.cortex_ascensions;
CREATE POLICY "cortex_ascensions_select_own" ON public.cortex_ascensions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE : deny-by-default pour les clients,
-- toutes les écritures passent par la fonction SECURITY DEFINER ci-dessous
-- (même principe que `rank_promotions`).

CREATE OR REPLACE FUNCTION public.record_cortex_ascension(_tier_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id      uuid := auth.uid();
  _current_max  integer;
  _current_title integer;
  _new_title    integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
  -- de grade au sein du même Titre) ET progression strictement croissante.
  IF _new_title <= _current_title THEN
    RETURN;
  END IF;

  INSERT INTO public.cortex_ascensions (user_id, tier_index, previous_tier_index)
  VALUES (_user_id, _tier_index, _current_max)
  ON CONFLICT (user_id, tier_index) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cortex_ascension(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cortex_ascension(integer) TO authenticated;
