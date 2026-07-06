import type { AchievementDef } from "../types";

/**
 * Catégorie HYROX — demandée par Nathan, mais AUCUNE donnée HYROX n'existe
 * dans l'app aujourd'hui (pas de module de simulation/chrono/événement).
 * Plutôt que d'inventer un faux déblocage, ces succès sont marqués
 * `comingSoon` : visibles (structure extensible en place), mais verrouillés
 * tant que le module HYROX n'existe pas. Voir le résumé de session pour le
 * détail de cette limitation.
 */
function comingSoon(
  id: string,
  title: string,
  description: string,
  rarity: AchievementDef["rarity"],
): AchievementDef {
  return {
    id,
    category: "hyrox",
    rarity,
    title,
    description,
    icon: "Shield",
    xpReward: 0,
    comingSoon: true,
    evaluate: () => ({ unlocked: false, progress: 0 }),
  };
}

export const hyroxAchievements: AchievementDef[] = [
  comingSoon(
    "hyrox_first_sim",
    "Première simulation",
    "Termine ta première simulation HYROX.",
    "common",
  ),
  comingSoon(
    "hyrox_first_event",
    "Premier événement",
    "Participe à ton premier événement HYROX officiel.",
    "rare",
  ),
  comingSoon(
    "hyrox_time_progress",
    "Contre la montre",
    "Améliore ton temps HYROX personnel.",
    "epic",
  ),
  comingSoon(
    "hyrox_goal",
    "Objectif HYROX",
    "Termine un objectif HYROX que tu t'es fixé.",
    "legendary",
  ),
];
