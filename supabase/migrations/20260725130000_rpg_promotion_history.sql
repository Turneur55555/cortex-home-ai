-- =====================================================================
-- Historique des promotions — Journal RPG (refonte page Progression,
-- 25/07/2026).
--
-- Nouvelle table PUREMENT ADDITIVE : consigne automatiquement chaque
-- franchissement de palier (tier_index 0..29, voir
-- src/lib/fitness/rpg/titleConfig.ts) au moment où user_stats.xp
-- augmente. Aucune saisie manuelle, aucune modification du calcul d'XP
-- ni du moteur de progression (titleProgress.ts) : le trigger ci-dessous
-- ne fait QUE lire xp et écrire une ligne d'historique.
--
-- compute_tier_index_from_xp() est une copie SQL, LECTURE SEULE, de
-- tierForXp()/XP_THRESHOLDS (titleConfig.ts). Si ces seuils sont un jour
-- rééquilibrés côté TS, cette fonction DOIT être mise à jour dans la
-- même migration pour rester cohérente — elle ne pilote aucun affichage
-- (titleProgress.ts reste l'unique moteur consommé par l'UI), elle ne
-- sert qu'à dater les promotions déjà survenues.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.compute_tier_index_from_xp(_xp integer)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
  SELECT COALESCE(MAX(idx - 1), 0)
  FROM unnest(ARRAY[
    0,200,550,900,1350,
    1800,2600,3700,5000,6450,
    8000,9700,12250,15200,18500,
    22000,25450,30500,36400,43000,
    50000,55550,63700,73200,83700,
    95000,116600,148200,185100,226000
  ]) WITH ORDINALITY AS t(threshold, idx)
  WHERE t.threshold <= GREATEST(_xp, 0);
$function$;

CREATE TABLE IF NOT EXISTS public.rank_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_index smallint NOT NULL CHECK (tier_index BETWEEN 0 AND 29),
  xp_at_promotion integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier_index)
);

ALTER TABLE public.rank_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rank_promotions_select_own" ON public.rank_promotions;
CREATE POLICY "rank_promotions_select_own" ON public.rank_promotions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE : deny-by-default pour les clients
-- (`anon`/`authenticated`), toutes les écritures passent par le trigger
-- SECURITY DEFINER ci-dessous.

CREATE OR REPLACE FUNCTION public.record_rank_promotions()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _old_tier integer;
  _new_tier integer;
  _i integer;
BEGIN
  _new_tier := public.compute_tier_index_from_xp(NEW.xp);
  _old_tier := CASE WHEN TG_OP = 'INSERT' THEN -1
                    ELSE public.compute_tier_index_from_xp(OLD.xp) END;

  IF _new_tier > _old_tier THEN
    FOR _i IN GREATEST(_old_tier + 1, 0).._new_tier LOOP
      INSERT INTO public.rank_promotions (user_id, tier_index, xp_at_promotion)
      VALUES (NEW.user_id, _i, NEW.xp)
      ON CONFLICT (user_id, tier_index) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_record_rank_promotions ON public.user_stats;
CREATE TRIGGER trg_record_rank_promotions
  AFTER INSERT OR UPDATE OF xp ON public.user_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.record_rank_promotions();

-- ── Migration des joueurs déjà en cours de partie ──────────────────────
-- Si un joueur possède déjà une XP au-delà du palier 0 (Mortel — Éveillé),
-- générer automatiquement l'historique manquant afin que la page ne soit
-- pas vide. XP au SEUIL du palier (pas l'XP actuelle) : l'approximation la
-- plus honnête d'un événement déjà passé dont l'XP exacte du moment n'a
-- pas été conservée.
INSERT INTO public.rank_promotions (user_id, tier_index, xp_at_promotion)
SELECT us.user_id, t.idx - 1, t.threshold
FROM public.user_stats us
CROSS JOIN LATERAL unnest(ARRAY[
  0,200,550,900,1350,
  1800,2600,3700,5000,6450,
  8000,9700,12250,15200,18500,
  22000,25450,30500,36400,43000,
  50000,55550,63700,73200,83700,
  95000,116600,148200,185100,226000
]) WITH ORDINALITY AS t(threshold, idx)
WHERE t.threshold <= GREATEST(us.xp, 0)
ON CONFLICT (user_id, tier_index) DO NOTHING;
