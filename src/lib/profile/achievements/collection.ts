// ============================================================
// Fusion de la collection Succès + Badges historiques en une seule liste.
// Domaine pur (aucun import React) — extrait de TrophyRoom.tsx pour être
// partagé entre la Salle des trophées complète et son aperçu compact sur le
// Profil, sans dupliquer la logique de fusion.
// ============================================================

import type { BadgeCategory, BadgeRarity } from "@/lib/fitness/badges";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import { ACHIEVEMENT_CATEGORY_ORDER, type AchievementCategory } from "./types";
import type { AchievementAggregate } from "./evaluate";

// Les badges "historiques" (moteur existant, non modifié) sont pliés dans les
// catégories du nouveau système pour former UNE seule collection à l'écran.
const LEGACY_TO_ACHIEVEMENT_CATEGORY: Record<BadgeCategory, AchievementCategory> = {
  first_steps: "first_steps",
  training: "rpg",
  consistency: "endurance",
  strength: "strength",
  progression: "rpg",
  duration: "endurance",
  cardio: "endurance",
  nutrition: "nutrition",
  transformation: "body",
  health: "body",
  challenges: "collection",
  journal: "exploration",
  community: "collection",
  secret: "secret",
};

export interface CollectionItem {
  key: string;
  category: AchievementCategory;
  rarity: BadgeRarity;
  title: string;
  description: string;
  /** Nom d'icône lucide-react (résolution React laissée à l'appelant). */
  icon: string;
  isUnlocked: boolean;
  isSecret: boolean;
  isComingSoon: boolean;
  progress: number;
  xpReward: number;
  currentLabel?: string;
  unlockedAt?: string | null;
}

const RARITY_RANK: Record<BadgeRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export interface AchievementCollection {
  items: CollectionItem[];
  unlockedCount: number;
  total: number;
  completionPct: number;
  rarityCounts: Record<BadgeRarity, { owned: number; total: number }>;
  categoryOverview: Array<readonly [AchievementCategory, { owned: number; total: number }]>;
  /** Succès débloqué de plus haute rareté, tous confondus (succès + badges). */
  rarestUnlocked: CollectionItem | null;
  /** Succès non secrets les plus proches du déblocage, triés par progression décroissante. */
  nearest: CollectionItem[];
  /** Un succès secret à mettre en avant (débloqué en priorité, sinon le plus proche). */
  secretHighlight: CollectionItem | null;
}

export function buildAchievementCollection(
  achievements: Pick<AchievementAggregate, "all">,
  legacyBadges: BadgeWithProgress[],
): AchievementCollection {
  const fromAchievements: CollectionItem[] = achievements.all.map((r) => ({
    key: r.def.id,
    category: r.def.category,
    rarity: r.def.rarity,
    title: r.def.title,
    description: r.def.description,
    icon: r.def.icon,
    isUnlocked: r.unlocked,
    isSecret: !!r.def.secret,
    isComingSoon: !!r.def.comingSoon,
    progress: r.progress,
    xpReward: r.def.xpReward,
    currentLabel: r.currentLabel,
    unlockedAt: undefined,
  }));

  const fromLegacy: CollectionItem[] = legacyBadges.map((b) => ({
    key: `legacy_${b.catalog.badge_key}`,
    category: LEGACY_TO_ACHIEVEMENT_CATEGORY[(b.catalog.category as BadgeCategory) ?? "training"],
    rarity: b.catalog.rarity as BadgeRarity,
    title: b.catalog.label,
    description: b.catalog.description,
    icon: b.catalog.icon,
    isUnlocked: b.isUnlocked,
    isSecret: !!b.catalog.is_secret,
    isComingSoon: !!b.catalog.is_coming_soon,
    progress: b.progress,
    xpReward: b.catalog.xp_reward,
    unlockedAt: b.unlockedAt,
  }));

  const items = [...fromAchievements, ...fromLegacy];

  const unlockedCount = items.filter((i) => i.isUnlocked).length;
  const total = items.length;
  const completionPct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const rarityCounts: Record<BadgeRarity, { owned: number; total: number }> = {
    common: { owned: 0, total: 0 },
    rare: { owned: 0, total: 0 },
    epic: { owned: 0, total: 0 },
    legendary: { owned: 0, total: 0 },
    mythic: { owned: 0, total: 0 },
  };
  for (const i of items) {
    rarityCounts[i.rarity].total += 1;
    if (i.isUnlocked) rarityCounts[i.rarity].owned += 1;
  }

  const categoryMap = new Map<AchievementCategory, { owned: number; total: number }>();
  for (const i of items) {
    if (!categoryMap.has(i.category)) categoryMap.set(i.category, { owned: 0, total: 0 });
    const e = categoryMap.get(i.category)!;
    e.total += 1;
    if (i.isUnlocked) e.owned += 1;
  }
  const categoryOverview = ACHIEVEMENT_CATEGORY_ORDER.filter((c) => categoryMap.has(c)).map(
    (c) => [c, categoryMap.get(c)!] as const,
  );

  const unlockedItems = items.filter((i) => i.isUnlocked);
  const rarestUnlocked =
    unlockedItems.length > 0
      ? [...unlockedItems].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity])[0]
      : null;

  const nearest = items
    .filter((i) => !i.isUnlocked && !i.isSecret && !i.isComingSoon && i.progress > 0)
    .sort((a, b) => b.progress - a.progress);

  const secretItems = items.filter((i) => i.isSecret && !i.isComingSoon);
  const unlockedSecret = secretItems.find((i) => i.isUnlocked);
  const secretHighlight =
    unlockedSecret ?? [...secretItems].sort((a, b) => b.progress - a.progress)[0] ?? null;

  return {
    items,
    unlockedCount,
    total,
    completionPct,
    rarityCounts,
    categoryOverview,
    rarestUnlocked,
    nearest,
    secretHighlight,
  };
}
