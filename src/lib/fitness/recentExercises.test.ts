import { describe, expect, it } from "vitest";
import { computeRecentExercises } from "./recentExercises";

describe("computeRecentExercises", () => {
  it("retourne un tableau vide sans historique", () => {
    expect(computeRecentExercises(undefined)).toEqual([]);
    expect(computeRecentExercises([])).toEqual([]);
  });

  it("déduplique par nom normalisé, en gardant la première occurrence", () => {
    const result = computeRecentExercises([
      { exercises: [{ name: "Développé couché", sets: 4, reps: 8, weight: 80 }] },
      { exercises: [{ name: "developpe couche", sets: 3, reps: 10, weight: 70 }] },
    ]);
    expect(result).toEqual([
      { name: "Développé couché", lastSets: 4, lastReps: 8, lastWeight: 80 },
    ]);
  });

  it("ignore les noms vides", () => {
    const result = computeRecentExercises([
      { exercises: [{ name: "  ", sets: 1, reps: 1, weight: 1 }] },
    ]);
    expect(result).toEqual([]);
  });

  it("borne le résultat à `limit`", () => {
    const workouts = Array.from({ length: 5 }, (_, i) => ({
      exercises: [{ name: `Exo ${i}`, sets: 1, reps: 1, weight: 1 }],
    }));
    expect(computeRecentExercises(workouts, 2)).toHaveLength(2);
  });

  it("gère les séances sans exercices", () => {
    expect(computeRecentExercises([{ exercises: null }, {}])).toEqual([]);
  });
});
