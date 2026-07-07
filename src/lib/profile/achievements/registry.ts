import { firstStepsAchievements } from "./definitions/firstSteps";
import { strengthAchievements } from "./definitions/strength";
import { hypertrophyAchievements } from "./definitions/hypertrophy";
import { enduranceAchievements } from "./definitions/endurance";
import { nutritionAchievements } from "./definitions/nutrition";
import { bodyAchievements } from "./definitions/body";
import { rpgAchievements } from "./definitions/rpg";
import { collectionAchievements } from "./definitions/collection";
import { hyroxAchievements } from "./definitions/hyrox";
import { runningAchievements } from "./definitions/running";
import { recoveryAchievements } from "./definitions/recovery";
import { guidedAchievements } from "./definitions/guided";
import { explorationAchievements } from "./definitions/exploration";
import { secretAchievements } from "./definitions/secret";
import type { AchievementDef } from "./types";

/**
 * Registre complet des succès. Pour ajouter une catégorie : créer un fichier
 * dans `definitions/`, exporter un tableau d'`AchievementDef`, l'ajouter ici.
 * Aucune autre couche à modifier.
 */
export const ACHIEVEMENT_REGISTRY: AchievementDef[] = [
  ...firstStepsAchievements,
  ...rpgAchievements,
  ...strengthAchievements,
  ...hypertrophyAchievements,
  ...enduranceAchievements,
  ...nutritionAchievements,
  ...bodyAchievements,
  ...recoveryAchievements,
  ...guidedAchievements,
  ...explorationAchievements,
  ...hyroxAchievements,
  ...runningAchievements,
  ...collectionAchievements,
  ...secretAchievements,
];

if (import.meta.env?.DEV) {
  const seen = new Set<string>();
  for (const def of ACHIEVEMENT_REGISTRY) {
    if (seen.has(def.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[achievements] id dupliqué détecté : ${def.id}`);
    }
    seen.add(def.id);
  }
}
