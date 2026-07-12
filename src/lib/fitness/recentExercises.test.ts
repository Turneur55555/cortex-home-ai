import { describe, expect, it } from "vitest";
import { computeRecentExercises } from "./recentExercises";

describe("computeRecentExercises", () => {
  it("retourne un tableau vide sans historique", () => {
    expect(computeRecentExercises(undefined)).toEqual([]);
    expect(computeRecentExercises([])).toEqual([]);
  });

  it("déduplique par nom normalisé, en gardant la première occurrence (filet de compatibilité, sans exercise_reference_id)", () => {
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

  it("déduplique par exercise_reference_id en priorité, même si le libellé brut diffère", () => {
    const result = computeRecentExercises([
      {
        exercises: [
          {
            name: "Développé couché",
            sets: 4,
            reps: 8,
            weight: 80,
            exercise_reference_id: "ref-1",
          },
        ],
      },
      {
        exercises: [
          // Libellé différent (renommage), même référence : doit fusionner
          // sur l'ancienne (première occurrence rencontrée = la plus récente).
          { name: "Bench press", sets: 3, reps: 10, weight: 70, exercise_reference_id: "ref-1" },
        ],
      },
    ]);
    expect(result).toEqual([
      { name: "Développé couché", lastSets: 4, lastReps: 8, lastWeight: 80 },
    ]);
  });

  it("ne fusionne pas deux exercise_reference_id distincts même si le nom normalisé est identique", () => {
    const result = computeRecentExercises([
      {
        exercises: [
          { name: "Rowing", sets: 4, reps: 8, weight: 80, exercise_reference_id: "ref-a" },
        ],
      },
      {
        exercises: [
          { name: "Rowing", sets: 3, reps: 10, weight: 70, exercise_reference_id: "ref-b" },
        ],
      },
    ]);
    expect(result).toHaveLength(2);
  });

  it("filet de compatibilité : une occurrence sans exercise_reference_id retombe sur le nom normalisé", () => {
    const result = computeRecentExercises([
      { exercises: [{ name: "Squat", sets: 5, reps: 5, weight: 100 }] },
      {
        exercises: [
          { name: "squat", sets: 4, reps: 6, weight: 90, exercise_reference_id: "ref-squat" },
        ],
      },
    ]);
    // Pas d'id sur la 1ère occurrence -> clé "name:squat" ; la 2e a un id
    // -> clé "id:ref-squat" distincte : les deux sont conservées (comme le
    // ferait une base non backfillée à 100%, cf. compat-net).
    expect(result).toHaveLength(2);
  });
});
