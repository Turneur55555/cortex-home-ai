import type { AchievementDef } from "../types";

// Méta-succès sur la collection elle-même — évalués en 2e passe par
// evaluate.ts, une fois les tallies calculés sur tous les AUTRES succès.
// `ctx.collectionStats` est garanti présent à ce stade.

const percentAchievements: AchievementDef[] = [25, 50, 75, 100].map((pct) => ({
  id: `collection_percent_${pct}`,
  category: "collection",
  rarity: pct >= 100 ? "mythic" : pct >= 75 ? "legendary" : pct >= 50 ? "epic" : "rare",
  title:
    pct >= 100
      ? "Collection complète"
      : pct >= 75
        ? "Collectionneur accompli"
        : pct >= 50
          ? "Mi-parcours"
          : "Premier quart",
  description: `Débloque ${pct} % de tous les succès disponibles.`,
  icon: "Trophy",
  xpReward: pct >= 100 ? 1000 : pct >= 75 ? 400 : pct >= 50 ? 200 : 80,
  evaluate: (ctx) => {
    const stats = ctx.collectionStats;
    if (!stats || stats.total === 0) return { unlocked: false, progress: 0 };
    const currentPct = (stats.unlockedCount / stats.total) * 100;
    return {
      unlocked: currentPct >= pct,
      progress: Math.max(0, Math.min(100, Math.round((currentPct / pct) * 100))),
      currentLabel: `${Math.round(currentPct)} %`,
    };
  },
}));

const allCategoriesAchievement: AchievementDef = {
  id: "collection_all_categories",
  category: "collection",
  rarity: "mythic",
  title: "Maître de toutes les voies",
  description: "Termine 100 % des succès dans chaque catégorie disponible.",
  icon: "Crown",
  xpReward: 800,
  evaluate: (ctx) => {
    const stats = ctx.collectionStats;
    if (!stats || stats.totalCategories === 0) return { unlocked: false, progress: 0 };
    return {
      unlocked: stats.categoriesComplete >= stats.totalCategories,
      progress: Math.max(
        0,
        Math.min(100, Math.round((stats.categoriesComplete / stats.totalCategories) * 100)),
      ),
      currentLabel: `${stats.categoriesComplete}/${stats.totalCategories} catégories`,
    };
  },
};

const allRaritiesAchievement: AchievementDef = {
  id: "collection_all_rarities",
  category: "collection",
  rarity: "legendary",
  title: "Toutes les couleurs",
  description: "Débloque au moins un succès de chaque rareté (Commun à Mythique).",
  icon: "Sparkles",
  xpReward: 350,
  evaluate: (ctx) => {
    const stats = ctx.collectionStats;
    if (!stats) return { unlocked: false, progress: 0 };
    const rarities: Array<keyof typeof stats.rarityCounts> = [
      "common",
      "rare",
      "epic",
      "legendary",
      "mythic",
    ];
    const owned = rarities.filter((r) => stats.rarityCounts[r] > 0).length;
    return {
      unlocked: owned >= rarities.length,
      progress: Math.round((owned / rarities.length) * 100),
      currentLabel: `${owned}/${rarities.length} raretés`,
    };
  },
};

export const collectionAchievements: AchievementDef[] = [
  ...percentAchievements,
  allCategoriesAchievement,
  allRaritiesAchievement,
];
