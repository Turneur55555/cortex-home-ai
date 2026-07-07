// ============================================================
// Fixture de test partagée — un AchievementContext valide "vide" (tout à
// zéro/absent), à surcharger champ par champ dans chaque test. Évite de
// répéter les ~30 champs obligatoires de AchievementContext dans chaque
// fichier de test (hyrox.test.ts, running.test.ts...).
// ============================================================

import type { AchievementContext } from "./types";

export function buildFixtureContext(
  overrides: Partial<AchievementContext> = {},
): AchievementContext {
  return {
    level: 1,
    xp: 0,
    streakDays: 0,

    workoutsCountTotal: 0,
    weeklyWorkouts: 0,
    guidedSessionsCount: 0,
    hyroxSimulationsCount: 0,
    hyroxDistinctStationsCount: 0,
    courseSessionsCount: 0,
    coursePrep5kDone: false,
    coursePrep10kDone: false,
    coursePrepSemiDone: false,
    coursePrepMarathonDone: false,
    goalsCompletedTotal: 0,
    bodyMeasurementsCount: 0,
    proteinDays30: 0,

    prByName: new Map(),
    histByName: new Map(),
    volByName: new Map(),
    nameByKey: new Map(),
    topExercises: [],

    totalVolumeSample: 0,
    totalSetsSample: 0,
    totalRepsSample: 0,
    distinctExerciseCount: 0,
    distinctMonthsActive: 0,
    distinctWeeksActive: 0,
    longestWeeklyStreak: 0,

    muscleGroupVolume: new Map(),
    dominantMuscleGroup: null,
    categoriesTrainedCount: 0,
    totalCategoriesCount: 0,

    rankProbes: [],
    rankAverage: null,
    rankBest: null,

    bodyWeightHistory: [],

    goals: [],
    legacyBadges: [],

    ...overrides,
  };
}
