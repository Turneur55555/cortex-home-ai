import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

const proteinDaysAchievements = buildMilestoneSeries({
  idPrefix: "nutrition_protein_days",
  category: "nutrition",
  icon: "Apple",
  select: (ctx) => ctx.proteinDays30,
  descriptionTemplate: (t) => `Atteins ton objectif protéines ${t} jours sur les 30 derniers.`,
  currentLabel: (v) => `${v}/30 j`,
  tiers: [
    { threshold: 3, rarity: "common", title: "Premiers jours propres" },
    { threshold: 7, rarity: "common", title: "Une semaine sous objectif" },
    { threshold: 14, rarity: "rare", title: "Discipline alimentaire" },
    { threshold: 21, rarity: "epic", title: "Trois semaines sur quatre" },
    { threshold: 25, rarity: "legendary", title: "Quasi parfait" },
    { threshold: 30, rarity: "mythic", title: "Mois protéiné parfait" },
  ],
});

const nutritionGoalsAchievements = buildMilestoneSeries({
  idPrefix: "nutrition_goals_completed",
  category: "nutrition",
  icon: "Apple",
  select: (ctx) =>
    ctx.goals.filter((g) => g.goal_type === "protein_daily" && g.is_completed).length,
  descriptionTemplate: (t) => `Termine ${t} objectif${t > 1 ? "s" : ""} nutrition.`,
  currentLabel: (v) => `${v}`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Objectif nutrition tenu" },
    { threshold: 3, rarity: "rare", title: "Nutrition maîtrisée" },
  ],
});

export const nutritionAchievements: AchievementDef[] = [
  ...proteinDaysAchievements,
  ...nutritionGoalsAchievements,
];
