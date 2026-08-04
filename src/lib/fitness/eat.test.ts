import { describe, expect, it } from "vitest";
import { computeDailyEAT, estimateSessionCalories, type WorkoutForEAT } from "./eat";

const TODAY = "2026-08-01";
const YESTERDAY = "2026-07-31";

describe("estimateSessionCalories", () => {
  it("returns null when duration is missing or zero (unfinished session)", () => {
    expect(estimateSessionCalories({ date: TODAY, duration_minutes: null }, 70)).toBeNull();
    expect(estimateSessionCalories({ date: TODAY, duration_minutes: 0 }, 70)).toBeNull();
  });

  it("reuses the discipline engine's own estimate when present in metadata", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "guided",
      duration_minutes: 45,
      metadata: { caloriesEstimate: 310 },
    };
    const estimate = estimateSessionCalories(workout, 70);
    expect(estimate).toEqual({
      kcal: 310,
      source: "computed",
      method: "met_duration",
      confidence: "estimate",
    });
  });

  it("estimates strength sessions from real tonnage (muscu discipline)", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 60,
      exercises: [{ sets: 4, reps: 10, weight: 50 }],
    };
    const estimate = estimateSessionCalories(workout, 70);
    expect(estimate).not.toBeNull();
    expect(estimate!.method).toBe("met_volume");
    expect(estimate!.kcal).toBeGreaterThan(0);
  });

  it("defaults to muscu when discipline is absent (legacy rows)", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      duration_minutes: 60,
      exercises: [{ sets: 4, reps: 10, weight: 50 }],
    };
    const estimate = estimateSessionCalories(workout, 70);
    expect(estimate!.method).toBe("met_volume");
  });

  it("estimates non-strength sessions with an explicit moderate intensity, not the volume-derived light default", () => {
    const course: WorkoutForEAT = { date: TODAY, discipline: "course", duration_minutes: 40 };
    const estimate = estimateSessionCalories(course, 70);
    expect(estimate).not.toBeNull();
    expect(estimate!.method).toBe("met_duration");
    // MET modéré (5.0) × 70 kg × (40/60) h = ~233 kcal — nettement au-dessus
    // de ce que donnerait l'intensité "light" (3.5) par défaut (~163 kcal).
    expect(estimate!.kcal).toBeGreaterThan(200);
  });

  it("handles sessions with partial data (no exercises, no metadata) without crashing or producing NaN", () => {
    const workout: WorkoutForEAT = { date: TODAY, discipline: "cardio", duration_minutes: 30 };
    const estimate = estimateSessionCalories(workout, null);
    expect(estimate).not.toBeNull();
    expect(Number.isFinite(estimate!.kcal)).toBe(true);
    expect(Number.isNaN(estimate!.kcal)).toBe(false);
  });

  it("changes the estimate when body weight changes", () => {
    const workout: WorkoutForEAT = { date: TODAY, discipline: "cardio", duration_minutes: 30 };
    const light = estimateSessionCalories(workout, 50);
    const heavy = estimateSessionCalories(workout, 100);
    expect(light!.kcal).toBeLessThan(heavy!.kcal);
  });

  it("never returns NaN for invalid/missing weight — falls back to a conservative default", () => {
    const workout: WorkoutForEAT = { date: TODAY, discipline: "cardio", duration_minutes: 30 };
    const estimate = estimateSessionCalories(workout, NaN);
    expect(estimate).not.toBeNull();
    expect(Number.isNaN(estimate!.kcal)).toBe(false);
  });
});

describe("computeDailyEAT", () => {
  it("returns 0 kcal when there is no session — never invents activity", () => {
    expect(computeDailyEAT(undefined, 70, TODAY)).toEqual({
      kcal: 0,
      sessionCount: 0,
      confidence: "estimate",
    });
    expect(computeDailyEAT([], 70, TODAY)).toEqual({
      kcal: 0,
      sessionCount: 0,
      confidence: "estimate",
    });
  });

  it("computes EAT for a single session", () => {
    const workouts: WorkoutForEAT[] = [
      {
        date: TODAY,
        discipline: "muscu",
        duration_minutes: 60,
        exercises: [{ sets: 4, reps: 10, weight: 50 }],
      },
    ];
    const eat = computeDailyEAT(workouts, 70, TODAY);
    expect(eat.sessionCount).toBe(1);
    expect(eat.kcal).toBeGreaterThan(0);
  });

  it("sums multiple sessions on the same day", () => {
    const workouts: WorkoutForEAT[] = [
      {
        date: TODAY,
        discipline: "muscu",
        duration_minutes: 60,
        exercises: [{ sets: 4, reps: 10, weight: 50 }],
      },
      { date: TODAY, discipline: "cardio", duration_minutes: 30 },
    ];
    const single = computeDailyEAT([workouts[0]], 70, TODAY);
    const both = computeDailyEAT(workouts, 70, TODAY);
    expect(both.sessionCount).toBe(2);
    expect(both.kcal).toBeGreaterThan(single.kcal);
  });

  it("ignores sessions with partial/invalid data without throwing, still counting valid ones", () => {
    const workouts: WorkoutForEAT[] = [
      { date: TODAY, discipline: "muscu", duration_minutes: null }, // séance non terminée
      {
        date: TODAY,
        discipline: "muscu",
        duration_minutes: 45,
        exercises: [{ sets: 3, reps: 8, weight: 40 }],
      },
    ];
    const eat = computeDailyEAT(workouts, 70, TODAY);
    expect(eat.sessionCount).toBe(2);
    expect(eat.kcal).toBeGreaterThan(0);
    expect(Number.isNaN(eat.kcal)).toBe(false);
  });

  it("only counts sessions matching the requested date, not other dates", () => {
    const workouts: WorkoutForEAT[] = [
      {
        date: YESTERDAY,
        discipline: "muscu",
        duration_minutes: 60,
        exercises: [{ sets: 4, reps: 10, weight: 50 }],
      },
      { date: TODAY, discipline: "cardio", duration_minutes: 30 },
    ];
    const today = computeDailyEAT(workouts, 70, TODAY);
    const yesterday = computeDailyEAT(workouts, 70, YESTERDAY);
    expect(today.sessionCount).toBe(1);
    expect(yesterday.sessionCount).toBe(1);
    expect(today.kcal).not.toBe(yesterday.kcal);
  });
});
