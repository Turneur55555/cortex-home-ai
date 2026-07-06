// ============================================================
// Générateur de séries de succès à paliers ("tiers"). Permet d'exprimer
// une famille de succès (ex : nombre de séances, volume, jours de série…)
// comme une simple liste de seuils + rareté + titre, plutôt que des dizaines
// d'objets répétitifs. C'est le mécanisme d'extensibilité demandé : ajouter
// un succès à une famille existante = ajouter une ligne à un tableau.
// ============================================================

import type {
  AchievementCategory,
  AchievementDef,
  AchievementContext,
  AchievementRarity,
} from "./types";

export interface Tier {
  threshold: number;
  rarity: AchievementRarity;
  title: string;
  /** Description spécifique ; sinon générée depuis `descriptionTemplate`. */
  description?: string;
}

export interface MilestoneSeriesOptions {
  idPrefix: string;
  category: AchievementCategory;
  icon: string;
  tiers: Tier[];
  /** Valeur courante de la métrique (nombre). */
  select: (ctx: AchievementContext) => number;
  descriptionTemplate: (threshold: number) => string;
  currentLabel?: (value: number) => string;
  xpForRarity?: Record<AchievementRarity, number>;
}

const DEFAULT_XP: Record<AchievementRarity, number> = {
  common: 30,
  rare: 60,
  epic: 120,
  legendary: 250,
  mythic: 500,
};

export function buildMilestoneSeries(opts: MilestoneSeriesOptions): AchievementDef[] {
  const xpFor = opts.xpForRarity ?? DEFAULT_XP;
  return opts.tiers.map((tier, i) => ({
    id: `${opts.idPrefix}_${i + 1}_${tier.threshold}`,
    category: opts.category,
    rarity: tier.rarity,
    title: tier.title,
    description: tier.description ?? opts.descriptionTemplate(tier.threshold),
    icon: opts.icon,
    xpReward: xpFor[tier.rarity],
    evaluate: (ctx) => {
      const value = opts.select(ctx);
      const progress = Math.max(0, Math.min(100, Math.round((value / tier.threshold) * 100)));
      return {
        unlocked: value >= tier.threshold,
        progress,
        currentLabel: opts.currentLabel ? opts.currentLabel(value) : undefined,
      };
    },
  }));
}

/** Succès binaire simple (débloqué / non débloqué), sans notion de palier numérique. */
export function defineAchievement(def: AchievementDef): AchievementDef {
  return def;
}
