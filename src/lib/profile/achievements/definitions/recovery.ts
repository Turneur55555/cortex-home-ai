import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

const weeklyStreakAchievements = buildMilestoneSeries({
  idPrefix: "recovery_weekly_streak",
  category: "recovery",
  icon: "Activity",
  select: (ctx) => ctx.longestWeeklyStreak,
  descriptionTemplate: (t) => `Enchaîne ${t} semaines consécutives avec au moins une séance.`,
  currentLabel: (v) => `${v} semaines`,
  tiers: [
    { threshold: 4, rarity: "common", title: "Un mois sans coupure" },
    { threshold: 8, rarity: "rare", title: "Deux mois de régularité" },
    { threshold: 12, rarity: "epic", title: "Un trimestre sans faille" },
    { threshold: 26, rarity: "legendary", title: "Six mois de rigueur" },
  ],
});

const weeklyTargetAchievements = buildMilestoneSeries({
  idPrefix: "recovery_weekly_target",
  category: "recovery",
  icon: "Target",
  select: (ctx) => ctx.weeklyWorkouts,
  descriptionTemplate: (t) =>
    `Enregistre ${t} séances cette semaine — un rythme d'entraînement/récupération équilibré.`,
  currentLabel: (v) => `${v} cette semaine`,
  tiers: [
    { threshold: 3, rarity: "common", title: "Semaine équilibrée" },
    { threshold: 5, rarity: "rare", title: "Semaine intense" },
  ],
});

const balanceAchievement: AchievementDef = {
  id: "recovery_balance",
  category: "recovery",
  rarity: "epic",
  title: "Équilibre trouvé",
  description:
    "Aucun groupe musculaire ne dépasse 25 % de ton volume total — un entraînement équilibré.",
  icon: "Sparkles",
  xpReward: 150,
  evaluate: (ctx) => {
    if (ctx.totalVolumeSample <= 0 || !ctx.dominantMuscleGroup) {
      return { unlocked: false, progress: 0 };
    }
    const dominant = ctx.muscleGroupVolume.get(ctx.dominantMuscleGroup) ?? 0;
    const pct = (dominant / ctx.totalVolumeSample) * 100;
    const unlocked = pct <= 25 && ctx.muscleGroupVolume.size >= 4;
    return {
      unlocked,
      progress: unlocked
        ? 100
        : Math.max(0, Math.min(100, Math.round((25 / Math.max(pct, 1)) * 100))),
      currentLabel: `${Math.round(pct)} % max sur un groupe`,
    };
  },
};

export const recoveryAchievements: AchievementDef[] = [
  ...weeklyStreakAchievements,
  ...weeklyTargetAchievements,
  balanceAchievement,
];
