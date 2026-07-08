import { describe, expect, it } from "vitest";
import { computeSupersetGroups } from "./workoutTemplates";

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
