import { defineAchievement } from "../tierBuilder";
import type { AchievementDef } from "../types";

/**
 * "Premiers pas" — succès uniques (pas de paliers), pensés pour être
 * débloqués tôt et donner un premier goût de la collection.
 */
export const firstStepsAchievements: AchievementDef[] = [
  defineAchievement({
    id: "first_steps_first_workout",
    category: "first_steps",
    rarity: "common",
    title: "Le grand départ",
    description: "Enregistre ta toute première séance.",
    icon: "Flame",
    xpReward: 30,
    evaluate: (ctx) => ({
      unlocked: ctx.workoutsCountTotal >= 1,
      progress: Math.min(100, ctx.workoutsCountTotal * 100),
    }),
  }),
  defineAchievement({
    id: "first_steps_first_pr",
    category: "first_steps",
    rarity: "common",
    title: "Premier record",
    description: "Établis ton premier record personnel sur un exercice.",
    icon: "Trophy",
    xpReward: 40,
    evaluate: (ctx) => ({
      unlocked: ctx.prByName.size >= 1,
      progress: ctx.prByName.size >= 1 ? 100 : 0,
    }),
  }),
  defineAchievement({
    id: "first_steps_first_active_week",
    category: "first_steps",
    rarity: "common",
    title: "Une semaine pleine",
    description: "Reste actif 7 jours consécutifs (séance, repas ou mensuration).",
    icon: "Flame",
    xpReward: 50,
    evaluate: (ctx) => ({
      unlocked: ctx.streakDays >= 7,
      progress: Math.min(100, Math.round((ctx.streakDays / 7) * 100)),
    }),
  }),
  defineAchievement({
    id: "first_steps_first_goal",
    category: "first_steps",
    rarity: "common",
    title: "Objectif tenu",
    description: "Termine ton premier objectif.",
    icon: "Target",
    xpReward: 40,
    evaluate: (ctx) => ({
      unlocked: ctx.goalsCompletedTotal >= 1,
      progress: ctx.goalsCompletedTotal >= 1 ? 100 : 0,
    }),
  }),
  defineAchievement({
    id: "first_steps_first_mastery",
    category: "first_steps",
    rarity: "rare",
    title: "Premier exercice maîtrisé",
    description: "Atteins le rang Guerrier sur un exercice au moins.",
    icon: "Shield",
    xpReward: 60,
    evaluate: (ctx) => {
      const reached = ctx.rankProbes.some((p) => p.rank.tierIndex >= 5);
      const best = ctx.rankProbes.reduce((m, p) => Math.max(m, p.rank.tierIndex), 0);
      return { unlocked: reached, progress: Math.min(100, Math.round((best / 5) * 100)) };
    },
  }),
  defineAchievement({
    id: "first_steps_first_body_log",
    category: "first_steps",
    rarity: "common",
    title: "Premier bilan",
    description: "Enregistre ton premier bilan corporel.",
    icon: "Activity",
    xpReward: 30,
    evaluate: (ctx) => ({
      unlocked: ctx.bodyMeasurementsCount >= 1,
      progress: ctx.bodyMeasurementsCount >= 1 ? 100 : 0,
    }),
  }),
  defineAchievement({
    id: "first_steps_first_protein_day",
    category: "first_steps",
    rarity: "common",
    title: "Objectif protéines atteint",
    description: "Atteins ton objectif protéines sur une journée.",
    icon: "Apple",
    xpReward: 30,
    evaluate: (ctx) => ({
      unlocked: ctx.proteinDays30 >= 1,
      progress: ctx.proteinDays30 >= 1 ? 100 : 0,
    }),
  }),
  defineAchievement({
    id: "first_steps_first_double_digit_streak",
    category: "first_steps",
    rarity: "rare",
    title: "Sur ma lancée",
    description: "Atteins une série de 10 jours d'activité consécutifs.",
    icon: "Flame",
    xpReward: 60,
    evaluate: (ctx) => ({
      unlocked: ctx.streakDays >= 10,
      progress: Math.min(100, Math.round((ctx.streakDays / 10) * 100)),
    }),
  }),
];
