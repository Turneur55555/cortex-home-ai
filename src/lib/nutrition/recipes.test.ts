import { describe, it, expect } from "vitest";
import { totalRecipeGrams } from "./recipes";

describe("totalRecipeGrams", () => {
  it("additionne les grammes quand tous les ingrédients ont une masse connue", () => {
    expect(totalRecipeGrams([{ grams: 200 }, { grams: 150 }, { grams: 50 }])).toBe(400);
  });

  it("retourne null si un seul ingrédient n'a pas de masse connue", () => {
    expect(totalRecipeGrams([{ grams: 200 }, { grams: null }, { grams: 50 }])).toBeNull();
  });

  it("retourne null si la liste est vide", () => {
    expect(totalRecipeGrams([])).toBeNull();
  });

  it("retourne null si la liste est null/undefined", () => {
    expect(totalRecipeGrams(null)).toBeNull();
    expect(totalRecipeGrams(undefined)).toBeNull();
  });

  it("retourne null si le total est nul (tous les ingrédients à 0 g)", () => {
    expect(totalRecipeGrams([{ grams: 0 }, { grams: 0 }])).toBeNull();
  });

  it("accepte un ingrédient à 0 g tant que les autres ont une masse connue et positive", () => {
    expect(totalRecipeGrams([{ grams: 0 }, { grams: 100 }])).toBe(100);
  });
});
