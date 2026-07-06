import { RANK_TIERS, LEVELS_PER_RANK, type RankKey } from "@/lib/fitness/exerciseRanks";
import type { AchievementDef, AchievementRarity } from "../types";

const RANK_RARITY: Record<RankKey, AchievementRarity> = {
  mortel: "common",
  guerrier: "common",
  heros: "rare",
  titan: "epic",
  olympien: "legendary",
  primordial: "mythic",
};

function thresholdFor(rankIndex: number): number {
  return rankIndex * LEVELS_PER_RANK;
}

// "Premier rang X" — au global, tous exercices sondés confondus (distinct des
// succès Force, qui sont spécifiques à une famille de mouvement).
const firstRankAchievements: AchievementDef[] = RANK_TIERS.slice(1).map((tier, i) => {
  const rankIndex = i + 1;
  const threshold = thresholdFor(rankIndex);
  return {
    id: `rpg_first_rank_${tier.key}`,
    category: "rpg",
    rarity: RANK_RARITY[tier.key as RankKey],
    title: `Premier ${tier.label}`,
    description: `Atteins le rang ${tier.label} sur au moins un exercice.`,
    icon: "Swords",
    xpReward: { common: 50, rare: 100, epic: 200, legendary: 400, mythic: 800 }[
      RANK_RARITY[tier.key as RankKey]
    ],
    evaluate: (ctx) => {
      const best = ctx.rankProbes.reduce((m, p) => Math.max(m, p.rank.tierIndex), 0);
      return {
        unlocked: best >= threshold,
        progress: Math.max(0, Math.min(100, Math.round((best / threshold) * 100))),
      };
    },
  };
});

const multiTitanAchievements: AchievementDef[] = [3, 5].map((count) => ({
  id: `rpg_multi_titan_${count}`,
  category: "rpg",
  rarity: count >= 5 ? "legendary" : "epic",
  title: count >= 5 ? "Panthéon des Titans" : "Plusieurs Titans",
  description: `Atteins le rang Titan ou plus sur ${count} exercices différents.`,
  icon: "Swords",
  xpReward: count >= 5 ? 400 : 200,
  evaluate: (ctx) => {
    const n = ctx.rankProbes.filter((p) => p.rank.tierIndex >= thresholdFor(3)).length;
    return {
      unlocked: n >= count,
      progress: Math.max(0, Math.min(100, Math.round((n / count) * 100))),
    };
  },
}));

const multiOlympianAchievements: AchievementDef[] = [2, 4].map((count) => ({
  id: `rpg_multi_olympian_${count}`,
  category: "rpg",
  rarity: count >= 4 ? "mythic" : "legendary",
  title: count >= 4 ? "Cercle des Olympiens" : "Deux Olympiens",
  description: `Atteins le rang Olympien ou plus sur ${count} exercices différents.`,
  icon: "Swords",
  xpReward: count >= 4 ? 700 : 400,
  evaluate: (ctx) => {
    const n = ctx.rankProbes.filter((p) => p.rank.tierIndex >= thresholdFor(4)).length;
    return {
      unlocked: n >= count,
      progress: Math.max(0, Math.min(100, Math.round((n / count) * 100))),
    };
  },
}));

const globalRankAchievements: AchievementDef[] = [
  {
    id: "rpg_global_rank_titan",
    category: "rpg",
    rarity: "epic",
    title: "Rang global : Titan",
    description: "Ton rang moyen (tous exercices suivis) atteint Titan.",
    icon: "Crown",
    xpReward: 220,
    evaluate: (ctx) => {
      const idx = ctx.rankAverage?.tierIndex ?? 0;
      const t = thresholdFor(3);
      return {
        unlocked: idx >= t,
        progress: Math.max(0, Math.min(100, Math.round((idx / t) * 100))),
      };
    },
  },
  {
    id: "rpg_global_rank_olympian",
    category: "rpg",
    rarity: "mythic",
    title: "Rang global : Olympien",
    description: "Ton rang moyen (tous exercices suivis) atteint Olympien.",
    icon: "Crown",
    xpReward: 500,
    evaluate: (ctx) => {
      const idx = ctx.rankAverage?.tierIndex ?? 0;
      const t = thresholdFor(4);
      return {
        unlocked: idx >= t,
        progress: Math.max(0, Math.min(100, Math.round((idx / t) * 100))),
      };
    },
  },
];

const masteryAchievements: AchievementDef[] = [80, 100].map((pct) => ({
  id: `rpg_mastery_${pct}`,
  category: "rpg",
  rarity: pct >= 100 ? "legendary" : "rare",
  title: pct >= 100 ? "Maîtrise parfaite" : "Maîtrise avancée",
  description: `Atteins ${pct} % de Maîtrise sur au moins un exercice.`,
  icon: "Sparkles",
  xpReward: pct >= 100 ? 300 : 100,
  evaluate: (ctx) => {
    const best = ctx.rankProbes.reduce((m, p) => Math.max(m, p.rank.xp), 0);
    return {
      unlocked: best >= pct,
      progress: Math.max(0, Math.min(100, Math.round((best / pct) * 100))),
    };
  },
}));

export const rpgAchievements: AchievementDef[] = [
  ...firstRankAchievements,
  ...multiTitanAchievements,
  ...multiOlympianAchievements,
  ...globalRankAchievements,
  ...masteryAchievements,
];
