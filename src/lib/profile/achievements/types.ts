// ============================================================
// Système de succès (achievements) — couche ADDITIVE et 100% cliente.
//
// Ne remplace ni ne modifie le moteur de Badges existant
// (lib/fitness/badges.ts, hooks/useBadgeSystem.ts, table Supabase
// `badges_catalog`) : ce moteur reste tel quel et continue de fonctionner.
// Cette couche ajoute ~180 succès supplémentaires, calculés en direct à
// partir des données déjà chargées par les hooks existants (séances, rangs,
// objectifs, corps) — aucune nouvelle table, aucune écriture Supabase,
// aucune modification du moteur Rang/Maîtrise.
//
// Extensibilité : pour ajouter un succès, on ajoute une entrée dans un des
// fichiers de `definitions/*.ts` (souvent via `buildTierSeries`, voir
// `tierBuilder.ts`) — aucune autre couche à toucher.
// ============================================================

import type { BadgeRarity } from "@/lib/fitness/badges";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import type { ExerciseFamily } from "@/lib/fitness/rank/types";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import type { GoalWithProgress } from "@/hooks/useGoalsWithProgress";

/** Même échelle de rareté que le moteur de badges existant — un seul vocabulaire visuel. */
export type AchievementRarity = BadgeRarity;

export type AchievementCategory =
  | "first_steps"
  | "strength"
  | "hypertrophy"
  | "endurance"
  | "nutrition"
  | "body"
  | "rpg"
  | "collection"
  | "hyrox"
  | "running"
  | "recovery"
  | "guided"
  | "exploration"
  | "secret";

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  first_steps: "Premiers pas",
  strength: "Force",
  hypertrophy: "Hypertrophie",
  endurance: "Endurance",
  nutrition: "Nutrition",
  body: "Corps",
  rpg: "RPG",
  collection: "Collection",
  hyrox: "HYROX",
  running: "Course",
  recovery: "Récupération",
  guided: "Activités accompagnées",
  exploration: "Exploration",
  secret: "Secrets",
};

export const ACHIEVEMENT_CATEGORY_EMOJI: Record<AchievementCategory, string> = {
  first_steps: "🔥",
  strength: "🏋️",
  hypertrophy: "💪",
  endurance: "⏱",
  nutrition: "🍎",
  body: "⚖️",
  rpg: "⚔️",
  collection: "🗃️",
  hyrox: "🧱",
  running: "🏃",
  recovery: "🌙",
  guided: "🧘",
  exploration: "🧭",
  secret: "⭐",
};

/** Ordre d'affichage par défaut dans la Salle des trophées. */
export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  "first_steps",
  "rpg",
  "strength",
  "hypertrophy",
  "endurance",
  "nutrition",
  "body",
  "recovery",
  "guided",
  "exploration",
  "hyrox",
  "running",
  "collection",
  "secret",
];

/**
 * Un exercice "sondé" (via RankAggregator élargi) : nom réel, famille
 * classifiée par le moteur existant, et état de rang produit par
 * `useExerciseProgression` — jamais recalculé ici.
 */
export interface ProbedExerciseRank {
  name: string;
  family: ExerciseFamily;
  rank: RankState;
  sessionCount: number;
}

/**
 * Contexte pur, entièrement dérivé de données déjà chargées ailleurs dans
 * l'app. Construit par `context.ts` à partir des retours de hooks existants
 * — cette interface ne déclenche elle-même aucune requête.
 */
export interface AchievementContext {
  level: number;
  xp: number;
  streakDays: number;

  workoutsCountTotal: number; // comptage exact serveur (non plafonné)
  weeklyWorkouts: number;
  /** Comptage exact serveur des séances discipline='guided' (Phase 6) —
   *  voir useDisciplineWorkoutCount, même principe que workoutsCountTotal. */
  guidedSessionsCount: number;
  goalsCompletedTotal: number;
  bodyMeasurementsCount: number;
  proteinDays30: number;

  // Dérivés de computePRs() (échantillon des ~60 dernières séances — limite
  // héritée de useWorkouts(), non modifiable ici).
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  nameByKey: Map<string, string>;
  topExercises: string[];

  totalVolumeSample: number;
  totalSetsSample: number;
  totalRepsSample: number;
  distinctExerciseCount: number;
  distinctMonthsActive: number;
  distinctWeeksActive: number;
  longestWeeklyStreak: number;

  muscleGroupVolume: Map<string, number>;
  dominantMuscleGroup: string | null;
  categoriesTrainedCount: number;
  totalCategoriesCount: number;

  rankProbes: ProbedExerciseRank[];
  rankAverage: RankState | null;
  rankBest: { name: string; rank: RankState } | null;

  bodyWeightHistory: Array<{ date: string; weight: number | null }>;

  goals: GoalWithProgress[];
  legacyBadges: BadgeWithProgress[];

  /**
   * Rempli en 2e passe par evaluate.ts, uniquement pour l'évaluation des
   * succès de catégorie "collection" (méta-succès sur la collection
   * elle-même). Absent lors de la 1re passe.
   */
  collectionStats?: {
    unlockedCount: number;
    total: number;
    rarityCounts: Record<AchievementRarity, number>;
    categoriesComplete: number;
    totalCategories: number;
  };
}

export interface AchievementResult {
  unlocked: boolean;
  /** 0..100 */
  progress: number;
  /** Valeur courante lisible (ex: "42 kg", "12 séances") — optionnel. */
  currentLabel?: string;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  /** Succès dont le nom/l'existence reste masqué tant qu'il n'est pas débloqué. */
  secret?: boolean;
  secretHint?: string;
  /** Succès dont la source de données n'existe pas encore dans l'app (HYROX, Course). */
  comingSoon?: boolean;
  evaluate: (ctx: AchievementContext) => AchievementResult;
}

export interface EvaluatedAchievement {
  def: AchievementDef;
  unlocked: boolean;
  progress: number;
  currentLabel?: string;
}
