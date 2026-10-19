import { describe, expect, it } from "vitest";
import { suggestMissingPieces } from "./missingPieces";
import type { OutfitScoringItem } from "./outfitEngine";

function item(overrides: Partial<OutfitScoringItem> & { id: string }): OutfitScoringItem {
  return {
    category: "top",
    subcategory: null,
    primary_color: null,
    secondary_colors: [],
    pattern: null,
    material: null,
    fit: null,
    formality: "casual",
    seasons: [],
    usage: ["quotidien"],
    ...overrides,
  };
}

describe("suggestMissingPieces", () => {
  it("dressing vide => aucune suggestion inventée", () => {
    expect(suggestMissingPieces([], "automne")).toEqual([]);
  });

  it("sans chaussures, la première suggestion est une paire, chiffrée en tenues complétées", () => {
    const items = [
      item({ id: "t1", primary_color: "noir" }),
      item({ id: "t2", primary_color: "bleu" }),
      item({ id: "b1", category: "bottom", primary_color: "beige" }),
    ];
    const [first] = suggestMissingPieces(items, "automne");
    expect(first.key).toBe("shoes");
    expect(first.unlocks).toBe(2);
    expect(first.title).toMatch(/sneakers/);
  });

  it("en automne, signale le manque de bas de saison quand il n'y a que des shorts d'été", () => {
    const items = [
      item({ id: "t1" }),
      item({ id: "b1", category: "bottom", seasons: ["printemps", "ete"] }),
      item({ id: "s1", category: "shoes" }),
    ];
    const keys = suggestMissingPieces(items, "automne").map((s) => s.key);
    expect(keys).toContain("seasonal_bottom");
    expect(keys).toContain("outerwear");
    expect(keys).not.toContain("shoes");
  });

  it("ne propose pas de veste en été", () => {
    const items = [item({ id: "t1" }), item({ id: "b1", category: "bottom" })];
    const keys = suggestMissingPieces(items, "ete").map((s) => s.key);
    expect(keys).not.toContain("outerwear");
  });

  it("est déterministe", () => {
    const items = [
      item({ id: "t1", primary_color: "vert" }),
      item({ id: "b1", category: "bottom" }),
    ];
    expect(suggestMissingPieces(items, "hiver")).toEqual(suggestMissingPieces(items, "hiver"));
  });
});
