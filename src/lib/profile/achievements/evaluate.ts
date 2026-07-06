import { ACHIEVEMENT_REGISTRY } from "./registry";
import type {
  AchievementContext,
  AchievementDef,
  AchievementRarity,
  AchievementCategory,
  EvaluatedAchievement,
} from "./types";
import { ACHIEVEMENT_CATEGORY_ORDER } from "./types";

const NEEDS_COLLECTION_STATS = new Set(["secret_collectionneur_ultime"]);

function evaluateOne(def: AchievementDef, ctx: AchievementContext): EvaluatedAchievement {
  const result = def.comingSoon ? { unlocked: false, progress: 0 } : def.evaluate(ctx);
  return {
    def,
    unlocked: result.unlocked,
    progress: result.progress,
    currentLabel: result.currentLabel,
  };
}

export interface AchievementAggregate {
  all: EvaluatedAchievement[];
  unlockedCount: number;
  total: number;
  completionPct: number;
  byCategory: Array<{
    category: AchievementCategory;
    unlocked: number;
    total: number;
    items: EvaluatedAchievement[];
  }>;
  rarityCounts: Record<AchievementRarity, { owned: number; total: number }>;
  rarestUnlocked: EvaluatedAchievement | null;
  nextObjective: EvaluatedAchievement | null;
}

export function evaluateAchievements(ctx: AchievementContext): AchievementAggregate {
  const standardDefs = ACHIEVEMENT_REGISTRY.filter(
    (d) => d.category !== "collection" && !NEEDS_COLLECTION_STATS.has(d.id),
  );
  const metaDefs = ACHIEVEMENT_REGISTRY.filter(
    (d) => d.category === "collection" || NEEDS_COLLECTION_STATS.has(d.id),
  );

  const standardResults = standardDefs.map((d) => evaluateOne(d, ctx));

  const rarityOrder: AchievementRarity[] = ["common", "rare", "epic", "legendary", "mythic"];
  const rarityCounts: Record<AchievementRarity, number> = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };
  for (const r of standardResults) if (r.unlocked) rarityCounts[r.def.rarity] += 1;

  const categoriesInStandard = new Set(standardDefs.map((d) => d.category));
  let categoriesComplete = 0;
  for (const cat of categoriesInStandard) {
    const items = standardResults.filter((r) => r.def.category === cat);
    if (items.length > 0 && items.every((r) => r.unlocked)) categoriesComplete += 1;
  }

  const ctxWithStats: AchievementContext = {
    ...ctx,
    collectionStats: {
      unlockedCount: standardResults.filter((r) => r.unlocked).length,
      total: standardResults.length,
      rarityCounts,
      categoriesComplete,
      totalCategories: categoriesInStandard.size,
    },
  };

  const metaResults = metaDefs.map((d) => evaluateOne(d, ctxWithStats));

  const all = [...standardResults, ...metaResults];

  const unlockedCount = all.filter((r) => r.unlocked).length;
  const total = all.length;
  const completionPct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const fullRarityCounts: Record<AchievementRarity, { owned: number; total: number }> = {
    common: { owned: 0, total: 0 },
    rare: { owned: 0, total: 0 },
    epic: { owned: 0, total: 0 },
    legendary: { owned: 0, total: 0 },
    mythic: { owned: 0, total: 0 },
  };
  for (const r of all) {
    fullRarityCounts[r.def.rarity].total += 1;
    if (r.unlocked) fullRarityCounts[r.def.rarity].owned += 1;
  }

  const byCategory = ACHIEVEMENT_CATEGORY_ORDER.map((category) => {
    const items = all.filter((r) => r.def.category === category);
    return {
      category,
      unlocked: items.filter((r) => r.unlocked).length,
      total: items.length,
      items,
    };
  }).filter((g) => g.total > 0);

  const rarityRank: Record<AchievementRarity, number> = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  };

  const unlocked = all.filter((r) => r.unlocked);
  const rarestUnlocked =
    unlocked.length > 0
      ? [...unlocked].sort((a, b) => rarityRank[b.def.rarity] - rarityRank[a.def.rarity])[0]
      : null;

  const candidates = all.filter((r) => !r.unlocked && !r.def.secret && !r.def.comingSoon);
  const nextObjective =
    candidates.length > 0 ? [...candidates].sort((a, b) => b.progress - a.progress)[0] : null;

  void rarityOrder;

  return {
    all,
    unlockedCount,
    total,
    completionPct,
    byCategory,
    rarityCounts: fullRarityCounts,
    rarestUnlocked,
    nextObjective,
  };
}
