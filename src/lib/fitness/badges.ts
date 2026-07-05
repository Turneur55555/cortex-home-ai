export type RequirementType =
  | "workouts_count"
  | "weekly_workouts"
  | "streak_days"
  | "protein_days"
  | "goals_completed"
  | "body_measurements"
  // Débloqué automatiquement côté serveur (trigger sur workouts), jamais via
  // un calcul de progression client — voir award_time_of_day_badges().
  | "time_of_day";

export type BadgeRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export type BadgeCategory =
  | "first_steps"
  | "training"
  | "consistency"
  | "strength"
  | "progression"
  | "duration"
  | "cardio"
  | "nutrition"
  | "transformation"
  | "health"
  | "challenges"
  | "journal"
  | "community"
  | "secret";

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
  category?: BadgeCategory | null;
  is_secret?: boolean;
  secret_hint?: string | null;
  is_coming_soon?: boolean;
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
  if (badge.is_coming_soon) return 0;
  // Débloqué uniquement par un trigger serveur à l'heure réelle de fin de
  // séance — aucune progression calculable côté client.
  if (badge.requirement_type === "time_of_day") return 0;
  const current = stats[badge.requirement_type as keyof FitnessStats] ?? 0;
  return Math.min(100, Math.round((current / badge.requirement_value) * 100));
}

// XP required to reach next level, using formula level = floor(sqrt(xp/100))
export function xpForLevel(level: number): number {
  return level * level * 100;
}

export const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: "#4ade80",
  rare: "#60a5fa",
  epic: "#a78bfa",
  legendary: "#fbbf24",
  mythic: "#ef4444",
};

export const RARITY_BORDER: Record<BadgeRarity, string> = {
  common: "border-emerald-400/30",
  rare: "border-blue-400/40",
  epic: "border-violet-400/50",
  legendary: "border-amber-400/60",
  mythic: "border-red-500/70",
};

export const RARITY_BG: Record<BadgeRarity, string> = {
  common: "from-emerald-400/15 to-emerald-500/5",
  rare: "from-blue-400/25 to-blue-500/10",
  epic: "from-violet-400/30 to-purple-500/15",
  legendary: "from-amber-400/35 to-orange-500/20",
  mythic: "from-red-500/40 to-black/60",
};

export const RARITY_TEXT: Record<BadgeRarity, string> = {
  common: "text-emerald-400",
  rare: "text-blue-400",
  epic: "text-violet-400",
  legendary: "text-amber-400",
  mythic: "text-red-400",
};

export const RARITY_PROGRESS: Record<BadgeRarity, string> = {
  common: "from-emerald-400 to-emerald-300",
  rare: "from-blue-500 to-blue-400",
  epic: "from-violet-500 to-purple-400",
  legendary: "from-amber-500 to-yellow-400",
  mythic: "from-red-600 via-red-500 to-orange-500",
};

export const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  mythic: "Mythique",
};

export const RARITY_RANK: Record<BadgeRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  first_steps: "Premiers pas",
  training: "Entraînement",
  consistency: "Régularité",
  strength: "Force",
  progression: "Progression",
  duration: "Temps",
  cardio: "Cardio",
  nutrition: "Nutrition",
  transformation: "Transformation",
  health: "Santé",
  challenges: "Défis",
  journal: "Journal",
  community: "Communauté",
  secret: "Secrets",
};

export const CATEGORY_EMOJI: Record<BadgeCategory, string> = {
  first_steps: "🔥",
  training: "💪",
  consistency: "📅",
  strength: "🏋️",
  progression: "📈",
  duration: "⏱",
  cardio: "❤️",
  nutrition: "🍎",
  transformation: "⚖️",
  health: "😴",
  challenges: "🎯",
  journal: "📷",
  community: "👥",
  secret: "⭐",
};
