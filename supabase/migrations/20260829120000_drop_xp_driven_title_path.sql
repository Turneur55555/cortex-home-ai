-- =====================================================================
-- Suppression du chemin concurrent XP → Titre (RPG V2, 29/08/2026).
--
-- Le Titre (Mortel..Titan) est désormais dérivé UNIQUEMENT de la chaîne
-- Performance → Rang exercice → Rang musculaire → Puissance Cortex (voir
-- src/lib/fitness/rpg/{muscleRank,cortexPower,cortexTitle}.ts). L'ancien
-- chemin XP → tier (compute_tier_index_from_xp) qui alimentait
-- rank_promotions à chaque changement de user_stats.xp est désormais un
-- second chemin concurrent vers "le Titre" — supprimé conformément à la
-- décision "une seule source de vérité doit déterminer le Titre".
--
-- Conséquence assumée, explicitement documentée (pas un effet de bord
-- silencieux) : la table `rank_promotions` et l'écran `/progression`
-- (PromotionHistoryTimeline) qui la lit cessent de recevoir de nouvelles
-- entrées — l'historique déjà enregistré reste lisible tel quel. Une
-- version de cette timeline pilotée par la Puissance Cortex est un
-- chantier de suivi distinct, non traité dans cette migration (nécessite
-- soit un mirroir SQL des 3 nouvelles couches de calcul, soit un chemin
-- d'écriture client — aucun des deux n'est improvisé ici).
--
-- N'affecte NI l'XP elle-même (user_stats.xp, xp_events, reward_catalog,
-- award_character_xp, award_xp_on_workout_complete — tous inchangés,
-- l'XP continue d'alimenter l'écran de récompense de fin de séance et son
-- propre historique) NI le moteur de Rang par exercice
-- (compute_tier_index_from_xp n'a jamais été utilisé par rank/engine.ts).
-- =====================================================================

DROP TRIGGER IF EXISTS trg_record_rank_promotions ON public.user_stats;
DROP FUNCTION IF EXISTS public.record_rank_promotions();
DROP FUNCTION IF EXISTS public.compute_tier_index_from_xp(integer);
