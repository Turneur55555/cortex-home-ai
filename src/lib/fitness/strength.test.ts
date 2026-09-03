import { describe, expect, it } from "vitest";
import { estimate1RM, exerciseActiveSeconds, setTonnage, workoutActiveSeconds } from "./strength";

const SEC_PER_REP = 2.5;

describe("estimate1RM", () => {
  it("returns weight unchanged for a single rep", () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it("returns null for invalid inputs", () => {
    expect(estimate1RM(null, 5)).toBeNull();
    expect(estimate1RM(100, 0)).toBeNull();
  });
});

describe("setTonnage", () => {
  it("multiplies sets × reps × weight", () => {
    expect(setTonnage(4, 10, 50)).toBe(2000);
  });

  it("returns 0 when any input is missing or invalid", () => {
    expect(setTonnage(null, 10, 50)).toBe(0);
    expect(setTonnage(4, 0, 50)).toBe(0);
  });
});

describe("workoutActiveSeconds", () => {
  it("sums active time from detailed sets, using reps × conservative seconds/rep", () => {
    const exercises = [
      {
        exercise_sets: [
          { reps: 10, completed: true },
          { reps: 8, completed: true },
        ],
      },
    ];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe((10 + 8) * SEC_PER_REP);
  });

  it("ignores sets explicitly marked as not completed", () => {
    const exercises = [
      {
        exercise_sets: [
          { reps: 10, completed: true },
          { reps: 20, completed: false },
        ],
      },
    ];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe(10 * SEC_PER_REP);
  });

  it("counts a set with no explicit completed flag (legacy rows)", () => {
    const exercises = [{ exercise_sets: [{ reps: 10 }] }];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe(10 * SEC_PER_REP);
  });

  it("is unaffected by weight — only reps drive active time", () => {
    const withLightWeight = [{ exercise_sets: [{ reps: 10, weight: 20, completed: true }] }];
    const withHeavyWeight = [{ exercise_sets: [{ reps: 10, weight: 120, completed: true }] }];
    expect(exerciseActiveSeconds(withLightWeight[0], SEC_PER_REP)).toBe(
      exerciseActiveSeconds(withHeavyWeight[0], SEC_PER_REP),
    );
  });

  it("uses an explicit duration_seconds when present, for time-based exercises", () => {
    const exercises = [{ exercise_sets: [{ duration_seconds: 45, reps: null, completed: true }] }];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe(45);
  });

  it("falls back to legacy aggregate sets × reps columns when no detailed sets exist", () => {
    const exercises = [{ sets: 4, reps: 10, exercise_sets: [] }];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe(4 * 10 * SEC_PER_REP);
  });

  it("returns 0 for an exercise with no usable data", () => {
    expect(exerciseActiveSeconds({}, SEC_PER_REP)).toBe(0);
  });

  it("sums across multiple exercises", () => {
    const exercises = [
      { exercise_sets: [{ reps: 10, completed: true }] },
      { exercise_sets: [{ reps: 8, completed: true }] },
    ];
    expect(workoutActiveSeconds(exercises, SEC_PER_REP)).toBe((10 + 8) * SEC_PER_REP);
  });
});
