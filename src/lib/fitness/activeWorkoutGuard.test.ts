import { describe, expect, it } from "vitest";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE, isActiveWorkoutConflict } from "./activeWorkoutGuard";

describe("isActiveWorkoutConflict", () => {
  it("détecte le conflit via le message", () => {
    expect(
      isActiveWorkoutConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "workouts_one_active_per_user"',
        details: null,
      }),
    ).toBe(true);
  });

  it("détecte le conflit via details", () => {
    expect(
      isActiveWorkoutConflict({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (user_id)=(...) conflicts with existing key (workouts_one_active_per_user).",
      }),
    ).toBe(true);
  });

  it("ignore une autre violation 23505 sans rapport avec l'index", () => {
    expect(
      isActiveWorkoutConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "some_other_constraint"',
        details: null,
      }),
    ).toBe(false);
  });

  it("ignore les autres codes / valeurs vides", () => {
    expect(
      isActiveWorkoutConflict({ code: "23503", message: "workouts_one_active_per_user" }),
    ).toBe(false);
    expect(isActiveWorkoutConflict(null)).toBe(false);
    expect(isActiveWorkoutConflict(undefined)).toBe(false);
    expect(isActiveWorkoutConflict({})).toBe(false);
  });

  it("le message exposé à l'utilisateur reste identique à l'historique", () => {
    expect(ACTIVE_WORKOUT_CONFLICT_MESSAGE).toBe("Une séance est déjà en cours.");
  });
});
