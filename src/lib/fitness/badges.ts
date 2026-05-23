export type RequirementType =
  | "workouts_count"
  | "weekly_workouts"
  | "streak_days"
  | "protein_days"
  | "goals_completed"
  | "body_measurements";

export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export interface BadgeCatalogEntry {
  id: string;
  badge_key: string;
  label: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  xp_reward: number;
  requirement_type: RequirementType;
  requirement_value: number;
  sort_order: number;
}

export interface FitnessStats {
  workouts_count: number;
  weekly_workouts: number;
  streak_days: number;
  protein_days: number;
  goals_completed: number;
  body_measurements: number;
}

export function computeBadgeProgress(badge: BadgeCatalogEntry, stats: FitnessStats): number {
  const current = stats[badge.requirement_type as keyof FitnessStats] ?? 0;
  return Math.min(100, Math.round((current / badge.requirement_value) * 100));
}

export const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: "#94a3b8",
  rare: "#60a5fa",
  epic: "#a78bfa",
  legendary: "#fbbf24",
};

export const RARITY_BORDER: Record<BadgeRarity, string> = {
  common: "border-slate-400/20",
  rare: "border-blue-400/30",
  epic: "border-violet-400/40",
  legendary: "border-amber-400/50",
};

export const RARITY_BG: Record<BadgeRarity, string> = {
  common: "from-slate-400/10 to-slate-500/5",
  rare: "from-blue-400/20 to-blue-500/10",
  epic: "from-violet-400/25 to-purple-500/15",
  legendary: "from-amber-400/30 to-orange-500/20",
};

export const RARITY_TEXT: Record<BadgeRarity, string> = {
  common: "text-slate-400",
  rare: "text-blue-400",
  epic: "text-violet-400",
  legendary: "text-amber-400",
};

export const RARITY_PROGRESS: Record<BadgeRarity, string> = {
  common: "from-slate-400 to-slate-300",
  rare: "from-blue-500 to-blue-400",
  epic: "from-violet-500 to-purple-400",
  legendary: "from-amber-500 to-yellow-400",
};

export const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
};
