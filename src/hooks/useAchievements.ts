import { useMemo } from "react";
import { useUserStats } from "@/hooks/useUserStats";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { useWorkouts, useBodyMeasurements } from "@/hooks/use-fitness";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { useDisciplineWorkoutCount } from "@/hooks/useDisciplineWorkoutCount";
import { useDisciplineMetadataSample } from "@/hooks/useDisciplineMetadataSample";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { classifyExerciseFamily } from "@/lib/fitness/rank/familyClassification";
import { buildAchievementContext } from "@/lib/profile/achievements/context";
import {
  evaluateAchievements,
  type AchievementAggregate,
} from "@/lib/profile/achievements/evaluate";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import type { FitnessStats } from "@/lib/fitness/badges";

export interface BadgeSystemSnapshot {
  stats: FitnessStats;
  badgesWithProgress: BadgeWithProgress[];
  isLoading: boolean;
}

/**
 * Câble le nouveau système de succès (couche additive, voir
 * lib/profile/achievements/) sur les hooks/données déjà existants. Aucune
 * nouvelle requête Supabase : tout provient de hooks déjà utilisés ailleurs
 * dans Profil (useUserStats, useActivityStreak, useBadgeSystem, useWorkouts,
 * useBodyMeasurements, useGoalsWithProgress) + du RankAggregate déjà calculé
 * par <RankAggregator> dans la page.
 */
export interface AchievementAggregateWithLoading extends AchievementAggregate {
  isLoading: boolean;
}

export function useAchievements(
  rankAggregate: RankAggregate,
  badgeSystem: BadgeSystemSnapshot,
): AchievementAggregateWithLoading {
  const { data: userStats } = useUserStats();
  const { current: streakDays } = useActivityStreak();
  const { badgesWithProgress, stats, isLoading: badgesLoading } = badgeSystem;
  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: bodyMeasurements } = useBodyMeasurements();
  const { goals, isLoading: goalsLoading } = useGoalsWithProgress();
  // Phase 6 (Activités accompagnées) : comptage exact, indépendant du
  // plafond à 60 lignes de useWorkouts() — voir useDisciplineWorkoutCount.
  const { data: guidedSessionsCount = 0 } = useDisciplineWorkoutCount("guided");
  // Phase 8 : HYROX/Course exploitent désormais de VRAIES données (plus de
  // comingSoon générique) — voir useDisciplineMetadataSample pour le détail
  // du contenu regardé (metadata.objective/station pour HYROX,
  // metadata.sessionType pour Course), jamais de donnée inventée.
  const { data: courseSessionsCount = 0 } = useDisciplineWorkoutCount("course");
  const { data: hyroxMetadataSample = [] } = useDisciplineMetadataSample("hyrox");
  const { data: courseMetadataSample = [] } = useDisciplineMetadataSample("course");

  const hyroxSimulationsCount = useMemo(
    () => hyroxMetadataSample.filter((m) => m.objective === "simulation_complete").length,
    [hyroxMetadataSample],
  );
  const hyroxDistinctStationsCount = useMemo(() => {
    const stations = new Set(
      hyroxMetadataSample
        .filter((m) => m.objective === "specific" && typeof m.station === "string")
        .map((m) => m.station as string),
    );
    return stations.size;
  }, [hyroxMetadataSample]);
  const coursePrepFlags = useMemo(
    () => ({
      coursePrep5kDone: courseMetadataSample.some((m) => m.sessionType === "prep_5k"),
      coursePrep10kDone: courseMetadataSample.some((m) => m.sessionType === "prep_10k"),
      coursePrepSemiDone: courseMetadataSample.some((m) => m.sessionType === "prep_semi"),
      coursePrepMarathonDone: courseMetadataSample.some((m) => m.sessionType === "prep_marathon"),
    }),
    [courseMetadataSample],
  );

  const { prByName, histByName, volByName, nameByKey, topExercises } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );

  const rankProbes = useMemo(
    () =>
      rankAggregate.reports.map((r) => ({
        name: r.name,
        family: classifyExerciseFamily(r.name),
        rank: r.rank,
        sessionCount: r.sessionCount,
      })),
    [rankAggregate.reports],
  );

  const bodyWeightHistory = useMemo(
    () =>
      (bodyMeasurements ?? [])
        .map((m) => ({ date: m.date, weight: m.weight ?? null }))
        .filter((m) => m.weight != null)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [bodyMeasurements],
  );

  const aggregate = useMemo(() => {
    const ctx = buildAchievementContext({
      level: userStats?.level ?? 1,
      xp: userStats?.xp ?? 0,
      streakDays,
      workoutsCountTotal: stats.workouts_count,
      weeklyWorkouts: stats.weekly_workouts,
      guidedSessionsCount,
      hyroxSimulationsCount,
      hyroxDistinctStationsCount,
      courseSessionsCount,
      ...coursePrepFlags,
      goalsCompletedTotal: stats.goals_completed,
      bodyMeasurementsCount: stats.body_measurements,
      proteinDays30: stats.protein_days,
      workoutsSample: (workouts ?? []).map((w) => ({
        date: w.date,
        exercises: (w.exercises ?? []).map((ex) => ({
          name: ex.name,
          weight: ex.weight,
          sets: ex.sets,
          reps: ex.reps,
        })),
      })),
      prByName,
      histByName,
      volByName,
      nameByKey,
      topExercises,
      rankProbes,
      rankAverage: rankAggregate.average,
      rankBest: rankAggregate.best
        ? { name: rankAggregate.best.name, rank: rankAggregate.best.rank }
        : null,
      bodyWeightHistory,
      goals,
      legacyBadges: badgesWithProgress,
    });
    return evaluateAchievements(ctx);
  }, [
    userStats,
    streakDays,
    stats,
    workouts,
    prByName,
    histByName,
    volByName,
    nameByKey,
    topExercises,
    rankProbes,
    rankAggregate.average,
    rankAggregate.best,
    bodyWeightHistory,
    goals,
    badgesWithProgress,
    guidedSessionsCount,
    hyroxSimulationsCount,
    hyroxDistinctStationsCount,
    courseSessionsCount,
    coursePrepFlags,
  ]);

  return {
    ...aggregate,
    isLoading: badgesLoading || workoutsLoading || goalsLoading || rankAggregate.isLoading,
  };
}
