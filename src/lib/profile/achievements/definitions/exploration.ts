import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

const distinctExercisesAchievements = buildMilestoneSeries({
  idPrefix: "exploration_distinct_exercises",
  category: "exploration",
  icon: "Sparkles",
  select: (ctx) => ctx.distinctExerciseCount,
  descriptionTemplate: (t) => `Pratique ${t} exercices différents.`,
  currentLabel: (v) => `${v} exercices`,
  tiers: [
    { threshold: 5, rarity: "common", title: "Curieux" },
    { threshold: 10, rarity: "common", title: "Explorateur" },
    { threshold: 20, rarity: "rare", title: "Grande variété" },
    { threshold: 35, rarity: "epic", title: "Répertoire étendu" },
    { threshold: 50, rarity: "legendary", title: "Encyclopédie vivante" },
  ],
});

const categoriesTrainedAchievements = buildMilestoneSeries({
  idPrefix: "exploration_categories",
  category: "exploration",
  icon: "Sparkles",
  select: (ctx) => ctx.categoriesTrainedCount,
  descriptionTemplate: (t) => `Travaille ${t} catégories musculaires différentes.`,
  currentLabel: (v) => `${v} catégories`,
  tiers: [
    { threshold: 3, rarity: "common", title: "Premiers horizons" },
    { threshold: 6, rarity: "rare", title: "Polyvalent" },
    { threshold: 9, rarity: "epic", title: "Corps complet" },
  ],
});

const allFamiliesAchievement: AchievementDef = {
  id: "exploration_all_families",
  category: "exploration",
  rarity: "legendary",
  title: "Toutes les familles",
  description: "Travaille au moins une fois chaque catégorie musculaire du catalogue.",
  icon: "Trophy",
  xpReward: 300,
  evaluate: (ctx) => ({
    unlocked: ctx.categoriesTrainedCount >= ctx.totalCategoriesCount,
    progress: Math.max(
      0,
      Math.min(100, Math.round((ctx.categoriesTrainedCount / ctx.totalCategoriesCount) * 100)),
    ),
    currentLabel: `${ctx.categoriesTrainedCount}/${ctx.totalCategoriesCount}`,
  }),
};

export const explorationAchievements: AchievementDef[] = [
  ...distinctExercisesAchievements,
  ...categoriesTrainedAchievements,
  allFamiliesAchievement,
];
