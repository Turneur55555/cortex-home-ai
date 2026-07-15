import { describe, expect, it } from "vitest";
import { computeRecentSegmentLabels } from "./recentSegmentLabels";

describe("computeRecentSegmentLabels", () => {
  it("retourne un tableau vide sans historique", () => {
    expect(computeRecentSegmentLabels(undefined)).toEqual([]);
    expect(computeRecentSegmentLabels([])).toEqual([]);
  });

  it("déduplique par libellé insensible à la casse, en gardant la première occurrence (la plus récente)", () => {
    const result = computeRecentSegmentLabels([
      { metadata: { segments: [{ label: "Rameur" }] } },
      { metadata: { segments: [{ label: "rameur" }] } },
    ]);
    expect(result).toEqual(["Rameur"]);
  });

  it("ignore les libellés vides", () => {
    expect(computeRecentSegmentLabels([{ metadata: { segments: [{ label: "  " }] } }])).toEqual([]);
  });

  it("ignore les séances sans metadata.segments", () => {
    expect(
      computeRecentSegmentLabels([
        { metadata: null },
        { metadata: {} },
        { metadata: { segments: undefined } },
      ]),
    ).toEqual([]);
  });

  it("borne le résultat à `limit`", () => {
    const workouts = Array.from({ length: 5 }, (_, i) => ({
      metadata: { segments: [{ label: `Exo ${i}` }] },
    }));
    expect(computeRecentSegmentLabels(workouts, 2)).toHaveLength(2);
  });

  it("conserve plusieurs exercices distincts dans une même séance", () => {
    const result = computeRecentSegmentLabels([
      { metadata: { segments: [{ label: "Rameur" }, { label: "Vélo" }] } },
    ]);
    expect(result).toEqual(["Rameur", "Vélo"]);
  });
});
