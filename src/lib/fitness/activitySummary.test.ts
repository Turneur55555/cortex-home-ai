import { describe, expect, it } from "vitest";
import { computeWeeklyActivitySummary, type WorkoutForSummary } from "./activitySummary";

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("computeWeeklyActivitySummary", () => {
  it("returns zeroes when there are no workouts", () => {
    expect(computeWeeklyActivitySummary(undefined, 70)).toEqual({
      sessionCount: 0,
      caloriesBurned: 0,
    });
    expect(computeWeeklyActivitySummary([], 70)).toEqual({ sessionCount: 0, caloriesBurned: 0 });
  });

  it("counts only sessions within the trailing window and sums estimated calories", () => {
    const workouts: WorkoutForSummary[] = [
      {
        date: daysAgoISO(1),
        duration_minutes: 60,
        exercises: [{ sets: 4, reps: 10, weight: 50 }],
      },
      {
        date: daysAgoISO(3),
        duration_minutes: 45,
        exercises: [{ sets: 3, reps: 8, weight: 40 }],
      },
      {
        date: daysAgoISO(20),
        duration_minutes: 50,
        exercises: [{ sets: 4, reps: 10, weight: 50 }],
      },
    ];

    const summary = computeWeeklyActivitySummary(workouts, 70, 7);
    expect(summary.sessionCount).toBe(2);
    expect(summary.caloriesBurned).toBeGreaterThan(0);
  });
});
