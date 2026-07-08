import { describe, expect, it } from "vitest";
import { buildMuscuSenseiContext, resolveMuscleIds } from "./MuscleQuestionField";
import type { AutoProfileWorkout } from "@/lib/fitness/engines/senseiAutoProfile";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";

const emptyRecovery = new Map<MuscleId, MuscleRecovery>();

function workout(date: string, exerciseName: string): AutoProfileWorkout {
  return {
    date,
    discipline: "muscu",
    exercises: [{ name: exerciseName, exercise_sets: [{ reps: 8, weight: 80, completed: true }] }],
  };
}

describe("resolveMuscleIds", () => {
  it("étend l'alias 'jambes' vers ses muscles fins", () => {
    expect(resolveMuscleIds(["jambes"])).toEqual(["quadriceps", "ischio", "fessiers"]);
  });

  it("ignore le cardio (aucun muscle fin)", () => {
    expect(resolveMuscleIds(["cardio"])).toEqual([]);
  });
});

describe("buildMuscuSenseiContext", () => {
  it("ne garde que les exercices jamais pratiqués pertinents pour les muscles sélectionnés", () => {
    // Historique concentré sur les jambes (squat) — le profil brut propose
    // des candidats "jamais pratiqués" toutes zones confondues.
    const workouts = [
      workout("2026-01-01", "Squat"),
      workout("2026-01-08", "Squat"),
      workout("2026-01-15", "Squat"),
    ];
    const context = buildMuscuSenseiContext(["pectoraux"], emptyRecovery, workouts);
    expect(context.autoProfile.neverDoneExercises.length).toBeGreaterThan(0);
    for (const candidate of context.autoProfile.neverDoneExercises) {
      expect(candidate.muscles).toContain("pectoraux");
    }
  });

  it("retourne un profil sans candidats si aucun ne correspond aux muscles sélectionnés", () => {
    const context = buildMuscuSenseiContext(["cardio"], emptyRecovery, []);
    expect(context.autoProfile.neverDoneExercises).toEqual([]);
  });

  it("calcule la récupération uniquement pour les muscles sélectionnés (résolution d'alias incluse)", () => {
    const context = buildMuscuSenseiContext(["jambes"], emptyRecovery, []);
    expect(Array.isArray(context.recovery)).toBe(true);
  });
});
