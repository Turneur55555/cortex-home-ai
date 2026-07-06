import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

const bodyLogAchievements = buildMilestoneSeries({
  idPrefix: "body_measurements",
  category: "body",
  icon: "Activity",
  select: (ctx) => ctx.bodyMeasurementsCount,
  descriptionTemplate: (t) => `Enregistre ${t} bilans corporels.`,
  currentLabel: (v) => `${v} bilans`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Premier bilan" },
    { threshold: 5, rarity: "common", title: "Suivi régulier" },
    { threshold: 10, rarity: "rare", title: "Suivi rigoureux" },
    { threshold: 20, rarity: "epic", title: "Historique complet" },
    { threshold: 50, rarity: "legendary", title: "Archiviste du corps" },
  ],
});

function weightChangeKg(ctx: Parameters<AchievementDef["evaluate"]>[0]): number {
  const known = ctx.bodyWeightHistory.filter((w) => w.weight != null) as Array<{
    date: string;
    weight: number;
  }>;
  if (known.length < 2) return 0;
  const first = known[0].weight;
  const last = known[known.length - 1].weight;
  return Math.abs(last - first);
}

const weightChangeAchievements = buildMilestoneSeries({
  idPrefix: "body_weight_change",
  category: "body",
  icon: "Activity",
  select: weightChangeKg,
  descriptionTemplate: (t) =>
    `Fais évoluer ton poids de ${t} kg depuis ta première pesée (dans un sens ou l'autre).`,
  currentLabel: (v) => `${Math.round(v * 10) / 10} kg`,
  tiers: [
    { threshold: 3, rarity: "common", title: "Première évolution" },
    { threshold: 5, rarity: "rare", title: "Transformation en cours" },
    { threshold: 10, rarity: "epic", title: "Transformation marquée" },
  ],
});

const weightGoalAchievement: AchievementDef = {
  id: "body_weight_goal_completed",
  category: "body",
  rarity: "epic",
  title: "Objectif de poids atteint",
  description: "Termine un objectif de perte (ou prise) de poids.",
  icon: "Target",
  xpReward: 150,
  evaluate: (ctx) => {
    const done = ctx.goals.filter((g) => g.goal_type === "weight_loss" && g.is_completed).length;
    return { unlocked: done >= 1, progress: done >= 1 ? 100 : 0, currentLabel: `${done}` };
  },
};

export const bodyAchievements: AchievementDef[] = [
  ...bodyLogAchievements,
  ...weightChangeAchievements,
  weightGoalAchievement,
];
