import type { AchievementDef } from "../types";

/**
 * Catégorie Course — même situation que HYROX : pas de module de course à
 * pied (temps, distances, allure) dans l'app aujourd'hui. Succès posés en
 * `comingSoon`, verrouillés, en attente d'un vrai module de données.
 */
function comingSoon(
  id: string,
  title: string,
  description: string,
  rarity: AchievementDef["rarity"],
): AchievementDef {
  return {
    id,
    category: "running",
    rarity,
    title,
    description,
    icon: "Activity",
    xpReward: 0,
    comingSoon: true,
    evaluate: () => ({ unlocked: false, progress: 0 }),
  };
}

export const runningAchievements: AchievementDef[] = [
  comingSoon("running_first_5k", "Premier 5 km", "Termine ta première course de 5 km.", "common"),
  comingSoon("running_first_10k", "Premier 10 km", "Termine ta première course de 10 km.", "rare"),
  comingSoon("running_half_marathon", "Semi-marathon", "Termine un semi-marathon.", "epic"),
  comingSoon("running_marathon", "Marathon", "Termine un marathon.", "legendary"),
  comingSoon(
    "running_pr",
    "Record personnel",
    "Bats ton record personnel sur une distance de course.",
    "rare",
  ),
];
