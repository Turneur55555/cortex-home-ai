import { describe, expect, it } from "vitest";
import { collectWorkoutSyncDependencies } from "./workoutSyncDependencies";

/**
 * CHANTIER 1 BIS — la connaissance métier « quels enregistrements sont les
 * enfants d'une séance » vit ICI, pas dans le moteur de file. Ces tests
 * fixent les trois garanties dont dépend la barrière : couverture exacte des
 * trois tables enfants, aucune fuite entre séances, aucun id optimiste.
 */

const W = "workout-1";
const OTHER = "workout-2";

const rows = {
  exercises: [
    { id: "ex-1", workout_id: W },
    { id: "ex-2", workout_id: W },
    { id: "ex-other", workout_id: OTHER },
  ],
  exerciseSets: [
    { id: "set-1", exercise_id: "ex-1" },
    { id: "set-2", exercise_id: "ex-1" },
    { id: "set-3", exercise_id: "ex-2" },
    { id: "set-other", exercise_id: "ex-other" },
    { id: "set-orphan", exercise_id: "ex-inconnu" },
  ],
  workoutSegments: [
    { id: "seg-1", workout_id: W },
    { id: "seg-other", workout_id: OTHER },
  ],
};

describe("collectWorkoutSyncDependencies", () => {
  it("couvre exactement exercises + exercise_sets + workout_segments de la séance", () => {
    expect(collectWorkoutSyncDependencies(W, rows)).toEqual([
      { table: "exercises", recordLocalId: "ex-1" },
      { table: "exercises", recordLocalId: "ex-2" },
      { table: "exercise_sets", recordLocalId: "set-1" },
      { table: "exercise_sets", recordLocalId: "set-2" },
      { table: "exercise_sets", recordLocalId: "set-3" },
      { table: "workout_segments", recordLocalId: "seg-1" },
    ]);
  });

  it("rattache les séries par la JOINTURE exercise_id → exercises.workout_id", () => {
    // `exercise_sets` ne porte aucun `workout_id` : sans la jointure, aucune
    // série ne pourrait être rattachée à sa séance.
    const refs = collectWorkoutSyncDependencies(W, rows);
    const sets = refs.filter((r) => r.table === "exercise_sets").map((r) => r.recordLocalId);
    expect(sets).toEqual(["set-1", "set-2", "set-3"]);
  });

  it("n'inclut jamais un enfant d'une AUTRE séance", () => {
    const ids = collectWorkoutSyncDependencies(W, rows).map((r) => r.recordLocalId);
    expect(ids).not.toContain("ex-other");
    expect(ids).not.toContain("set-other");
    expect(ids).not.toContain("seg-other");
  });

  it("ignore une série orpheline (exercice inconnu du store)", () => {
    const ids = collectWorkoutSyncDependencies(W, rows).map((r) => r.recordLocalId);
    expect(ids).not.toContain("set-orphan");
  });

  it("une séance SANS enfant ne produit AUCUNE dépendance (clôture immédiate)", () => {
    expect(
      collectWorkoutSyncDependencies("workout-vide", {
        exercises: [],
        exerciseSets: [],
        workoutSegments: [],
      }),
    ).toEqual([]);
    expect(collectWorkoutSyncDependencies("workout-vide", rows)).toEqual([]);
  });

  it("AUCUN id optimiste `tmp-*` ne peut entrer dans les dépendances", () => {
    // Un `tmp-*` ne correspond à aucune opération de la file : le déclarer
    // produirait une barrière qui ne retient rien — DISC-01b silencieusement
    // réintroduit. Second rempart, l'appelant devant déjà fournir le store local.
    const refs = collectWorkoutSyncDependencies(W, {
      exercises: [
        { id: "ex-1", workout_id: W },
        { id: "tmp-abc", workout_id: W },
      ],
      exerciseSets: [
        { id: "set-1", exercise_id: "ex-1" },
        { id: "tmp-def", exercise_id: "ex-1" },
        // Série rattachée à un exercice encore optimiste : l'exercice étant
        // écarté, elle l'est aussi (aucune dépendance sur un id inexistant).
        { id: "set-9", exercise_id: "tmp-abc" },
      ],
      workoutSegments: [
        { id: "seg-1", workout_id: W },
        { id: "tmp-ghi", workout_id: W },
      ],
    });
    const ids = refs.map((r) => r.recordLocalId);
    expect(ids).toEqual(["ex-1", "set-1", "seg-1"]);
    expect(ids.some((id) => id.startsWith("tmp-"))).toBe(false);
  });

  it("ne dépend d'aucun champ au-delà des ids et des clés de rattachement", () => {
    // Formes minimales : le helper reste utilisable avec n'importe quelle
    // ligne du domaine sans couplage aux types de hooks.
    expect(
      collectWorkoutSyncDependencies(W, {
        exercises: [{ id: "ex-1", workout_id: W }],
        exerciseSets: [{ id: "set-1", exercise_id: "ex-1" }],
        workoutSegments: [],
      }),
    ).toEqual([
      { table: "exercises", recordLocalId: "ex-1" },
      { table: "exercise_sets", recordLocalId: "set-1" },
    ]);
  });
});
