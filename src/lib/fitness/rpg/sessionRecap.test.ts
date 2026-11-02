import { describe, expect, it } from "vitest";
import { buildSessionRecap } from "./sessionRecap";

describe("buildSessionRecap — séries et tonnage de la carte récap", () => {
  it("compte les séries au poids du corps (charge NULL ou 0) sans les ajouter au tonnage", () => {
    // Séance « Dos » du 02/11/2026 en production : 20 séries cochées dont 2 tractions à la
    // charge vide (NULL). La carte récap en annonçait 18.
    const recap = buildSessionRecap([
      {
        id: "tirage",
        name: "Tirage horizontal",
        exercise_sets: [
          { reps: 10, weight: 60 },
          { reps: 10, weight: 60 },
        ],
      },
      {
        id: "traction",
        name: "Traction prise neutre",
        exercise_sets: [
          { reps: 8, weight: null },
          { reps: 7, weight: null },
        ],
      },
      { id: "dips", name: "Dips", exercise_sets: [{ reps: 12, weight: 0 }] },
    ]);
    expect(recap.totalSets).toBe(5);
    expect(recap.totalVolumeKg).toBe(1200);
    expect(recap.exercises.map((e) => [e.name, e.sets])).toEqual([
      ["Tirage horizontal", 2],
      ["Traction prise neutre", 2],
      ["Dips", 1],
    ]);
  });

  it("une série sans répétitions exploitables n'est pas une série", () => {
    const recap = buildSessionRecap([
      {
        id: "x",
        name: "X",
        exercise_sets: [
          { reps: 0, weight: 50 },
          { reps: null, weight: 50 },
          { reps: Number.NaN, weight: null },
          { reps: 10, weight: -5 },
          { reps: 10, weight: 50 },
        ],
      },
    ]);
    expect(recap.totalSets).toBe(1);
    expect(recap.totalVolumeKg).toBe(500);
  });

  it("sans série détaillée exploitable : repli sur les colonnes résumé", () => {
    const recap = buildSessionRecap([
      { id: "a", name: "A", exercise_sets: [], sets: 3, reps: 10, weight: 40 },
      { id: "b", name: "B", exercise_sets: null, sets: 2, reps: null, weight: null },
    ]);
    expect(recap.totalSets).toBe(5);
    expect(recap.totalVolumeKg).toBe(1200);
  });

  it("une séance entièrement au poids du corps a des séries et un tonnage nul", () => {
    const recap = buildSessionRecap([
      {
        id: "t",
        name: "Tractions",
        exercise_sets: [
          { reps: 10, weight: null },
          { reps: 9, weight: null },
          { reps: 8, weight: null },
        ],
      },
    ]);
    expect(recap).toEqual({
      totalSets: 3,
      totalVolumeKg: 0,
      exercises: [{ id: "t", name: "Tractions", imagePath: null, sets: 3 }],
    });
  });
});
