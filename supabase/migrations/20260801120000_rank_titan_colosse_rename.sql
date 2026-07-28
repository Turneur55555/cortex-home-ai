-- =====================================================================
-- Rang par exercice — renommage de la taxonomie (validé par Nathan) :
--   Titan (tiers 15-19)      -> Colosse
--   Primordial (tiers 25-29) -> Titan
-- Seuls la clé et le libellé changent ; couleurs/motif/montants XP restent
-- attachés à la MÊME position de tier (aucune renumérotation de tierIndex,
-- voir src/lib/fitness/exerciseRanks.ts). Renomme les `source_key` du
-- catalogue de récompenses en conséquence, sans toucher à `xp_events`
-- (l'historique déjà versé garde son libellé d'origine, comme tout journal).
-- =====================================================================

UPDATE public.reward_catalog
  SET source_key = 'exercise_rank_up_colosse',
      description = 'Montée de Rang par exercice — famille Colosse'
  WHERE source_key = 'exercise_rank_up_titan';

UPDATE public.reward_catalog
  SET source_key = 'exercise_rank_up_titan',
      description = 'Montée de Rang par exercice — famille Titan'
  WHERE source_key = 'exercise_rank_up_primordial';
