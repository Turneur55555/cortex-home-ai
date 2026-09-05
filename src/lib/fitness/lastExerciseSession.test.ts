import { describe, expect, it } from "vitest";
import { selectLastExerciseSessions } from "./lastExerciseSession";
import { identityKey } from "./recentExercises";

/**
 * CHANTIER 9 (E1) — la règle « dernière séance d'un exercice », désormais pure
 * et testée. Elle décide de deux choses visibles pendant la séance : la ligne
 * « dernière fois » sur la carte, et les valeurs pré-remplies quand on ajoute
 * une série. Se tromper de séance de référence, c'est faire croire à une
 * progression qui n'a pas eu lieu.
 */

const KEY_DC = identityKey({ name: "Développé couché", exercise_reference_id: null });
const REF = "ref-squat";
const KEY_SQUAT = identityKey({ name: "Peu importe", exercise_reference_id: REF });

function rows(overrides: {
  workouts?: Array<{ id: string; date: string | null; status: string | null }>;
  exercises?: Array<{
    id: string;
    workout_id: string | null;
    name: string;
    exercise_reference_id: string | null;
  }>;
  exerciseSets?: Array<{
    exercise_id: string;
    set_number: number;
    reps: number | null;
    weight: number | null;
    completed: boolean;
  }>;
}) {
  return {
    workouts: overrides.workouts ?? [],
    exercises: overrides.exercises ?? [],
    exerciseSets: overrides.exerciseSets ?? [],
  };
}

describe("selectLastExerciseSessions", () => {
  it("retient la séance TERMINÉE la plus récente et renvoie ses séries triées", () => {
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [
          { id: "w-ancienne", date: "2026-01-01", status: "completed" },
          { id: "w-recente", date: "2026-06-01", status: "completed" },
        ],
        exercises: [
          {
            id: "e1",
            workout_id: "w-ancienne",
            name: "Développé couché",
            exercise_reference_id: null,
          },
          {
            id: "e2",
            workout_id: "w-recente",
            name: "Développé couché",
            exercise_reference_id: null,
          },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: 10, weight: 50, completed: true },
          { exercise_id: "e2", set_number: 2, reps: 8, weight: 80, completed: true },
          { exercise_id: "e2", set_number: 1, reps: 10, weight: 70, completed: true },
        ],
      }),
    });

    expect(result.get(KEY_DC)).toEqual({
      workoutId: "w-recente",
      date: "2026-06-01",
      sets: [
        { set_number: 1, reps: 10, weight: 70 },
        { set_number: 2, reps: 8, weight: 80 },
      ],
    });
  });

  it("H3 — une série SAISIE mais non validée n'est pas une référence", () => {
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [{ id: "w1", date: "2026-06-01", status: "completed" }],
        exercises: [
          { id: "e1", workout_id: "w1", name: "Développé couché", exercise_reference_id: null },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: 10, weight: 70, completed: false },
        ],
      }),
    });
    expect(result.size).toBe(0);
  });

  it("la séance EN COURS n'est jamais sa propre référence", () => {
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: "w-en-cours",
      rows: rows({
        workouts: [
          { id: "w-en-cours", date: "2026-06-02", status: "completed" },
          { id: "w-passee", date: "2026-06-01", status: "completed" },
        ],
        exercises: [
          {
            id: "e1",
            workout_id: "w-en-cours",
            name: "Développé couché",
            exercise_reference_id: null,
          },
          {
            id: "e2",
            workout_id: "w-passee",
            name: "Développé couché",
            exercise_reference_id: null,
          },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: 12, weight: 90, completed: true },
          { exercise_id: "e2", set_number: 1, reps: 10, weight: 70, completed: true },
        ],
      }),
    });
    expect(result.get(KEY_DC)?.workoutId).toBe("w-passee");
  });

  it("une séance ACTIVE présente dans le store local n'est pas une référence non plus", () => {
    // Le store local contient la séance en cours : sans filtre de statut, une
    // séance seulement commencée servirait de « dernière fois ».
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [
          { id: "w-active", date: "2026-06-02", status: "active" },
          { id: "w-passee", date: "2026-06-01", status: "completed" },
        ],
        exercises: [
          {
            id: "e1",
            workout_id: "w-active",
            name: "Développé couché",
            exercise_reference_id: null,
          },
          {
            id: "e2",
            workout_id: "w-passee",
            name: "Développé couché",
            exercise_reference_id: null,
          },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: 12, weight: 90, completed: true },
          { exercise_id: "e2", set_number: 1, reps: 10, weight: 70, completed: true },
        ],
      }),
    });
    expect(result.get(KEY_DC)?.workoutId).toBe("w-passee");
  });

  it("remonte à la séance précédente quand la plus récente n'a aucune série renseignée", () => {
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [
          { id: "w-vide", date: "2026-06-02", status: "completed" },
          { id: "w-pleine", date: "2026-06-01", status: "completed" },
        ],
        exercises: [
          { id: "e1", workout_id: "w-vide", name: "Développé couché", exercise_reference_id: null },
          {
            id: "e2",
            workout_id: "w-pleine",
            name: "Développé couché",
            exercise_reference_id: null,
          },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: null, weight: null, completed: true },
          { exercise_id: "e2", set_number: 1, reps: 10, weight: 70, completed: true },
        ],
      }),
    });
    expect(result.get(KEY_DC)?.workoutId).toBe("w-pleine");
  });

  it("l'identité prime sur le nom : deux libellés différents, même référence d'exercice", () => {
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_SQUAT]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [{ id: "w1", date: "2026-06-01", status: "completed" }],
        exercises: [
          { id: "e1", workout_id: "w1", name: "Squat barre", exercise_reference_id: REF },
        ],
        exerciseSets: [{ exercise_id: "e1", set_number: 1, reps: 5, weight: 120, completed: true }],
      }),
    });
    expect(result.get(KEY_SQUAT)?.sets).toEqual([{ set_number: 1, reps: 5, weight: 120 }]);
  });

  it("n'invente rien : aucun exercice demandé, aucune séance datée → résultat vide", () => {
    expect(
      selectLastExerciseSessions({ keys: new Set(), excludeWorkoutId: null, rows: rows({}) }).size,
    ).toBe(0);

    const undated = selectLastExerciseSessions({
      keys: new Set([KEY_DC]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [{ id: "w1", date: null, status: "completed" }],
        exercises: [
          { id: "e1", workout_id: "w1", name: "Développé couché", exercise_reference_id: null },
        ],
        exerciseSets: [{ exercise_id: "e1", set_number: 1, reps: 10, weight: 70, completed: true }],
      }),
    });
    expect(undated.size).toBe(0);
  });

  it("ne mélange jamais deux exercices différents", () => {
    const keyOther = identityKey({ name: "Tractions", exercise_reference_id: null });
    const result = selectLastExerciseSessions({
      keys: new Set([KEY_DC, keyOther]),
      excludeWorkoutId: null,
      rows: rows({
        workouts: [{ id: "w1", date: "2026-06-01", status: "completed" }],
        exercises: [
          { id: "e1", workout_id: "w1", name: "Développé couché", exercise_reference_id: null },
          { id: "e2", workout_id: "w1", name: "Tractions", exercise_reference_id: null },
        ],
        exerciseSets: [
          { exercise_id: "e1", set_number: 1, reps: 10, weight: 70, completed: true },
          { exercise_id: "e2", set_number: 1, reps: 8, weight: 5, completed: true },
        ],
      }),
    });
    expect(result.get(KEY_DC)?.sets).toEqual([{ set_number: 1, reps: 10, weight: 70 }]);
    expect(result.get(keyOther)?.sets).toEqual([{ set_number: 1, reps: 8, weight: 5 }]);
  });
});
