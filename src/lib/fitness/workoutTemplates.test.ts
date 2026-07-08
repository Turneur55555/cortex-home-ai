import { describe, expect, it } from "vitest";
import { computeSupersetGroups, workoutToTemplateSeed } from "./workoutTemplates";

describe("computeSupersetGroups", () => {
  it("retourne null pour toutes les lignes sans superset", () => {
    const rows = [
      { supersetWithPrevious: false },
      { supersetWithPrevious: false },
      { supersetWithPrevious: false },
    ];
    expect(computeSupersetGroups(rows)).toEqual([null, null, null]);
  });

  it("groupe deux lignes consécutives liées par 'superset avec le précédent'", () => {
    const rows = [{ supersetWithPrevious: false }, { supersetWithPrevious: true }];
    const groups = computeSupersetGroups(rows);
    expect(groups[0]).not.toBeNull();
    expect(groups[0]).toBe(groups[1]);
  });

  it("gère deux supersets distincts dans le même modèle", () => {
    const rows = [
      { supersetWithPrevious: false }, // A
      { supersetWithPrevious: true }, // lié à A
      { supersetWithPrevious: false }, // B (seul)
      { supersetWithPrevious: false }, // C
      { supersetWithPrevious: true }, // lié à C
    ];
    const groups = computeSupersetGroups(rows);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[2]).toBeNull();
    expect(groups[3]).toBe(groups[4]);
    expect(groups[0]).not.toBe(groups[3]);
  });

  it("chaîne trois exercices consécutifs dans le même groupe", () => {
    const rows = [
      { supersetWithPrevious: false },
      { supersetWithPrevious: true },
      { supersetWithPrevious: true },
    ];
    const groups = computeSupersetGroups(rows);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[1]).toBe(groups[2]);
  });

  it("ignore un superset marqué sur la toute première ligne (pas de précédent)", () => {
    const rows = [{ supersetWithPrevious: true }, { supersetWithPrevious: false }];
    expect(computeSupersetGroups(rows)).toEqual([null, null]);
  });

  it("retourne un tableau vide pour une liste vide", () => {
    expect(computeSupersetGroups([])).toEqual([]);
  });
});

describe("workoutToTemplateSeed", () => {
  it("regroupe les séries d'un même exercice : compte les sets, garde la charge max et les reps de la dernière série", () => {
    const rows = [
      { name: "Développé couché", sets: 1, reps: 10, weight: 60, notes: null },
      { name: "Développé couché", sets: 1, reps: 8, weight: 70, notes: null },
      { name: "Développé couché", sets: 1, reps: 6, weight: 65, notes: "Pause 2s" },
    ];
    const seed = workoutToTemplateSeed(rows);
    expect(seed).toEqual([
      {
        name: "Développé couché",
        default_sets: 3,
        default_reps: 6,
        default_weight: 70,
        notes: "Pause 2s",
      },
    ]);
  });

  it("préserve l'ordre de première apparition entre exercices distincts", () => {
    const rows = [
      { name: "Squat", sets: 1, reps: 5, weight: 100, notes: null },
      { name: "Développé militaire", sets: 1, reps: 8, weight: 40, notes: null },
      { name: "Squat", sets: 1, reps: 5, weight: 105, notes: null },
    ];
    const seed = workoutToTemplateSeed(rows);
    expect(seed.map((e) => e.name)).toEqual(["Squat", "Développé militaire"]);
    expect(seed[0].default_sets).toBe(2);
  });

  it("fusionne deux variantes accentuées différemment du même nom", () => {
    const rows = [
      { name: "Developpe couche", sets: 1, reps: 10, weight: 50, notes: null },
      { name: "Développé Couché", sets: 1, reps: 8, weight: 55, notes: null },
    ];
    const seed = workoutToTemplateSeed(rows);
    expect(seed).toHaveLength(1);
    expect(seed[0].default_sets).toBe(2);
    expect(seed[0].default_weight).toBe(55);
    // Conserve le nom de la première occurrence rencontrée.
    expect(seed[0].name).toBe("Developpe couche");
  });

  it("ignore les lignes sans nom et gère une liste vide", () => {
    expect(workoutToTemplateSeed([])).toEqual([]);
    expect(
      workoutToTemplateSeed([{ name: "  ", sets: 1, reps: 10, weight: 20, notes: null }]),
    ).toEqual([]);
  });

  it("renvoie null pour sets/reps/weight/notes jamais renseignés", () => {
    const seed = workoutToTemplateSeed([
      { name: "Gainage", sets: null, reps: null, weight: null, notes: null },
    ]);
    expect(seed).toEqual([
      { name: "Gainage", default_sets: 1, default_reps: null, default_weight: null, notes: null },
    ]);
  });
});
