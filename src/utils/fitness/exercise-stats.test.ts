import { describe, expect, it } from "vitest";
import { computePRs } from "./exercise-stats";

describe("computePRs — Étape 4.6 (identité par exercise_reference_id)", () => {
  it("fusionne deux instances portant le même exercise_reference_id malgré des libellés texte différents", () => {
    const { prByName, histByName } = computePRs([
      {
        id: "w1",
        date: "2026-07-01",
        name: "Séance 1",
        exercises: [
          {
            id: "e1",
            name: "Développé couché",
            weight: 80,
            sets: 1,
            reps: 8,
            exercise_reference_id: "ref-1",
          },
        ],
      },
      {
        id: "w2",
        date: "2026-07-08",
        name: "Séance 2",
        exercises: [
          {
            id: "e2",
            name: "developpe couche (variante saisie)",
            weight: 90,
            sets: 1,
            reps: 6,
            exercise_reference_id: "ref-1",
          },
        ],
      },
    ]);

    expect(prByName.size).toBe(1);
    const [key] = prByName.keys();
    expect(key).toBe("id:ref-1");
    expect(prByName.get(key)).toBe(90);
    expect(histByName.get(key)).toHaveLength(2);
  });

  it("ne fusionne pas deux exercise_reference_id distincts même si le nom normalisé coïncide (pas de faux positif)", () => {
    const { prByName } = computePRs([
      {
        id: "w1",
        date: "2026-07-01",
        name: "Séance 1",
        exercises: [
          {
            id: "e1",
            name: "Rowing",
            weight: 50,
            sets: 1,
            reps: 8,
            exercise_reference_id: "ref-a",
          },
          {
            id: "e2",
            name: "Rowing",
            weight: 60,
            sets: 1,
            reps: 8,
            exercise_reference_id: "ref-b",
          },
        ],
      },
    ]);

    expect(prByName.size).toBe(2);
    expect(prByName.get("id:ref-a")).toBe(50);
    expect(prByName.get("id:ref-b")).toBe(60);
  });

  it("filet de compatibilité : sans exercise_reference_id, retombe sur le nom normalisé comme avant", () => {
    const { prByName } = computePRs([
      {
        id: "w1",
        date: "2026-07-01",
        name: "Séance 1",
        exercises: [{ id: "e1", name: "Squat", weight: 100, sets: 1, reps: 5 }],
      },
      {
        id: "w2",
        date: "2026-07-08",
        name: "Séance 2",
        exercises: [{ id: "e2", name: "squat", weight: 110, sets: 1, reps: 5 }],
      },
    ]);

    expect(prByName.size).toBe(1);
    expect(prByName.get("name:squat")).toBe(110);
  });

  it("ignore les noms vides", () => {
    const { prByName, nameByKey } = computePRs([
      {
        id: "w1",
        date: "2026-07-01",
        name: "Séance 1",
        exercises: [{ id: "e1", name: "  ", weight: 10, sets: 1, reps: 1 }],
      },
    ]);
    expect(prByName.size).toBe(0);
    expect(nameByKey.size).toBe(0);
  });
});
