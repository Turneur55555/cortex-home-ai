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

  it("estimates strength sessions from the active time of validated sets (muscu discipline)", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 60,
      exercises: [{ sets: 4, reps: 10, weight: 50 }],
    };
    const estimate = estimateSessionCalories(workout, 70);
    expect(estimate).not.toBeNull();
    expect(estimate!.method).toBe("reps_active_time");
    expect(estimate!.kcal).toBeGreaterThan(0);
  });

  it("defaults to muscu when discipline is absent (legacy rows)", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      duration_minutes: 60,
      exercises: [{ sets: 4, reps: 10, weight: 50 }],
    };
    const estimate = estimateSessionCalories(workout, 70);
    expect(estimate!.method).toBe("reps_active_time");
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

describe("estimateSessionCalories — musculation : moteur basé sur les séries (pas la durée)", () => {
  it("FONDAMENTAL : deux séances muscu avec les mêmes séries mais des durée_minutes différentes produisent la MÊME estimation", () => {
    const exercises = [
      { exercise_sets: [{ reps: 10, weight: 50, completed: true }, { reps: 8, weight: 55, completed: true }] },
      { exercise_sets: [{ reps: 12, weight: 30, completed: true }] },
    ];
    const short: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 60,
      exercises,
    };
    const long: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 180,
      exercises,
    };
    const shortEstimate = estimateSessionCalories(short, 70);
    const longEstimate = estimateSessionCalories(long, 70);
    expect(shortEstimate).not.toBeNull();
    expect(shortEstimate!.kcal).toBe(longEstimate!.kcal);
  });

  it("sums calories across several exercises with several sets and different rep counts", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [
        {
          exercise_sets: [
            { reps: 10, weight: 50, completed: true },
            { reps: 8, weight: 55, completed: true },
            { reps: 6, weight: 60, completed: true },
          ],
        },
        {
          exercise_sets: [
            { reps: 12, weight: 20, completed: true },
            { reps: 12, weight: 20, completed: true },
          ],
        },
      ],
    };
    const estimate = estimateSessionCalories(workout, 70);
    const singleExercise: WorkoutForEAT = { ...workout, exercises: [workout.exercises![0]] };
    const singleEstimate = estimateSessionCalories(singleExercise, 70);
    expect(estimate!.kcal).toBeGreaterThan(singleEstimate!.kcal);
  });

  it("ignores sets that were not validated (completed: false)", () => {
    const withExtraUnvalidatedSet: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [
        {
          exercise_sets: [
            { reps: 10, weight: 50, completed: true },
            { reps: 999, weight: 50, completed: false },
          ],
        },
      ],
    };
    const withoutExtraSet: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [{ exercise_sets: [{ reps: 10, weight: 50, completed: true }] }],
    };
    expect(estimateSessionCalories(withExtraUnvalidatedSet, 70)!.kcal).toBe(
      estimateSessionCalories(withoutExtraSet, 70)!.kcal,
    );
  });

  it("is unaffected by a tonnage change (weight) that leaves reps unchanged", () => {
    const lightLoad: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [{ exercise_sets: [{ reps: 10, weight: 20, completed: true }] }],
    };
    const heavyLoad: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [{ exercise_sets: [{ reps: 10, weight: 150, completed: true }] }],
    };
    expect(estimateSessionCalories(lightLoad, 70)!.kcal).toBe(
      estimateSessionCalories(heavyLoad, 70)!.kcal,
    );
  });

  it("a very long session with few sets stays low; a short session with the same sets matches it exactly", () => {
    const fewSets: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 240,
      exercises: [{ exercise_sets: [{ reps: 8, weight: 40, completed: true }] }],
    };
    const sameSetsShortSession: WorkoutForEAT = { ...fewSets, duration_minutes: 20 };
    const estimate = estimateSessionCalories(fewSets, 70)!;
    expect(estimate.kcal).toBe(estimateSessionCalories(sameSetsShortSession, 70)!.kcal);
    // 8 reps × 2.5s/rep = 20s actifs → très faible dépense, sans rapport avec les 240 min affichées.
    expect(estimate.kcal).toBeLessThan(20);
  });

  it("scales with a different body weight", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [{ exercise_sets: [{ reps: 10, weight: 50, completed: true }] }],
    };
    const light = estimateSessionCalories(workout, 50)!;
    const heavy = estimateSessionCalories(workout, 100)!;
    expect(light.kcal).toBeLessThan(heavy.kcal);
  });

  it("handles partial data (exercises present but no usable reps) without crashing — conservative null rather than invented data", () => {
    const workout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 45,
      exercises: [{ exercise_sets: [{ reps: null, weight: null, completed: true }] }],
    };
    expect(estimateSessionCalories(workout, 70)).toBeNull();
  });

  it("still computes for an old session using only legacy aggregate columns (no exercise_sets detail)", () => {
    const legacyWorkout: WorkoutForEAT = {
      date: TODAY,
      discipline: "muscu",
      duration_minutes: 50,
      exercises: [{ sets: 3, reps: 10, weight: 60 }],
    };
    const estimate = estimateSessionCalories(legacyWorkout, 70);
    expect(estimate).not.toBeNull();
    expect(estimate!.kcal).toBeGreaterThan(0);
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
