// ============================================================
// Construction du AchievementContext — fonction pure, aucun hook ici.
// Assemble uniquement des données déjà produites par des hooks/calculs
// existants (voir useAchievements.ts pour le câblage réel).
// ============================================================

import type { AchievementContext, ProbedExerciseRank } from "./types";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import type { GoalWithProgress } from "@/hooks/useGoalsWithProgress";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { computeBroadActivity, type WorkoutLike } from "./muscleVolume";
import { CATALOG_GROUPS } from "@/lib/fitness/exerciseCatalog";

export interface BuildAchievementContextInput {
  level: number;
  xp: number;
  streakDays: number;
  workoutsCountTotal: number;
  weeklyWorkouts: number;
  goalsCompletedTotal: number;
  bodyMeasurementsCount: number;
  proteinDays30: number;
  workoutsSample: WorkoutLike[] | null | undefined;
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  nameByKey: Map<string, string>;
  topExercises: string[];
  rankProbes: ProbedExerciseRank[];
  rankAverage: RankState | null;
  rankBest: { name: string; rank: RankState } | null;
  bodyWeightHistory: Array<{ date: string; weight: number | null }>;
  goals: GoalWithProgress[];
  legacyBadges: BadgeWithProgress[];
}

export function buildAchievementContext(input: BuildAchievementContextInput): AchievementContext {
  const broad = computeBroadActivity(input.workoutsSample, 8);

  return {
    level: input.level,
    xp: input.xp,
    streakDays: input.streakDays,
    workoutsCountTotal: input.workoutsCountTotal,
    weeklyWorkouts: input.weeklyWorkouts,
    goalsCompletedTotal: input.goalsCompletedTotal,
    bodyMeasurementsCount: input.bodyMeasurementsCount,
    proteinDays30: input.proteinDays30,

    prByName: input.prByName,
    histByName: input.histByName,
    volByName: input.volByName,
    nameByKey: input.nameByKey,
    topExercises: input.topExercises,

    totalVolumeSample: broad.totalVolume,
    totalSetsSample: broad.totalSets,
    totalRepsSample: broad.totalReps,
    distinctExerciseCount: broad.distinctExerciseCount,
    distinctMonthsActive: broad.distinctMonthsActive,
    distinctWeeksActive: broad.distinctWeeksActive,
    longestWeeklyStreak: broad.longestWeeklyStreak,

    muscleGroupVolume: broad.muscleGroupVolume,
    dominantMuscleGroup: broad.dominantMuscleGroup,
    categoriesTrainedCount: broad.categoriesTrainedCount,
    totalCategoriesCount: CATALOG_GROUPS.length,

    rankProbes: input.rankProbes,
    rankAverage: input.rankAverage,
    rankBest: input.rankBest,

    bodyWeightHistory: input.bodyWeightHistory,

    goals: input.goals,
    legacyBadges: input.legacyBadges,
  };
}
