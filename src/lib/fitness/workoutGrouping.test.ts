import { describe, it, expect } from "vitest";
import { buildGroups, sessionMuscleActivation, type ExerciseLike } from "./workoutGrouping";

// Séance minimale — mêmes conventions que WorkoutCard (source d'origine de
// la logique extraite). On vérifie que le comportement est préservé.

describe("buildGroups", () => {
  it("regroupe les lignes par identité et agrège séries/tonnage/max", () => {
    const rows: ExerciseLike[] = [
      { id: "a1", name: "Développé couché", weight: 80, sets: null, reps: 10 },
      { id: "a2", name: "Développé couché", weight: 90, sets: null, reps: 8 },
      { id: "b1", name: "Squat", weight: 100, sets: null, reps: 5 },
    ];
    const groups = buildGroups(rows);
    expect(groups).toHaveLength(2);

    const bench = groups.find((g) => g.name === "Développé couché")!;
    expect(bench.totalSeries).toBe(2);
    expect(bench.maxWeight).toBe(90);
    expect(bench.totalReps).toBe(18);
    expect(bench.volume).toBe(80 * 10 + 90 * 8);
    expect(bench.sourceIds).toEqual(["a1", "a2"]);
  });

  it("priorise exercise_sets et ignore les séries non validées (completed=false)", () => {
    const rows: ExerciseLike[] = [
      {
        id: "x1",
        name: "Tractions",
        weight: null,
        sets: null,
        reps: null,
        exercise_sets: [
          { id: "s1", set_number: 1, reps: 10, weight: 0, completed: true },
          { id: "s2", set_number: 2, reps: 8, weight: 0, completed: false },
        ],
      },
    ];
    const groups = buildGroups(rows);
    expect(groups[0].totalSeries).toBe(1);
    expect(groups[0].totalReps).toBe(10);
  });

  it("respecte la convention legacy colonnes inversées quand weight est NULL", () => {
    // weight NULL → `sets` porte les reps, `reps` porte la charge.
    const rows: ExerciseLike[] = [{ id: "l1", name: "Curl", weight: null, sets: 12, reps: 20 }];
    const groups = buildGroups(rows);
    expect(groups[0].series[0].reps).toBe(12);
    expect(groups[0].series[0].weight).toBe(20);
  });

  it("ignore les lignes au nom vide", () => {
    const rows: ExerciseLike[] = [{ id: "e1", name: "   ", weight: 50, sets: null, reps: 5 }];
    expect(buildGroups(rows)).toHaveLength(0);
  });
});

describe("sessionMuscleActivation", () => {
  it("répartit séries et tonnage sur les muscles sollicités, triés par volume", () => {
    const rows: ExerciseLike[] = [
      { id: "a1", name: "Développé couché", weight: 80, sets: null, reps: 10 }, // pecs/triceps/épaules
      { id: "b1", name: "Squat", weight: 120, sets: null, reps: 5 }, // quadri/fessiers
    ];
    const activation = sessionMuscleActivation(rows);
    const ids = activation.map((a) => a.id);
    expect(ids).toContain("pectoraux");
    expect(ids).toContain("quadriceps");
    // Volume décroissant (le squat 600 kg passe devant le pec 800 kg ? non :
    // pec volume 800 > squat 600) — on vérifie juste l'ordre monotone.
    for (let i = 1; i < activation.length; i++) {
      expect(activation[i - 1].volume).toBeGreaterThanOrEqual(activation[i].volume);
    }
    const pecs = activation.find((a) => a.id === "pectoraux")!;
    expect(pecs.sets).toBe(1);
    expect(pecs.volume).toBe(800);
    expect(pecs.exercises).toEqual(["Développé couché"]);
  });

  it("retombe sur muscle_groups (IA) quand le regex ne matche pas", () => {
    const rows: ExerciseLike[] = [
      {
        id: "c1",
        name: "Exercice maison inconnu",
        weight: 40,
        sets: null,
        reps: 12,
        muscle_groups: ["biceps"],
      },
    ];
    const activation = sessionMuscleActivation(rows);
    expect(activation.map((a) => a.id)).toEqual(["biceps"]);
  });
});
