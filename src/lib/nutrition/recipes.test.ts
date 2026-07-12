import { describe, it, expect } from "vitest";
import { perServing, recipeMacros, scaleServings, totalRecipeGrams } from "./recipes";

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

describe("recipeMacros — fibres", () => {
  it("agrège les fibres comme les autres macros (per_100g × grams / 100)", () => {
    const total = recipeMacros([
      { grams: 200, caloriesPer100g: 100, fiberPer100g: 5 }, // 10 g fibre
      { grams: 100, caloriesPer100g: 50, fiberPer100g: 2 }, // 2 g fibre
    ]);
    expect(total.fiber).toBe(12);
  });

  it("traite un ingrédient sans donnée fibre comme une contribution nulle (même convention que les autres macros)", () => {
    const total = recipeMacros([
      { grams: 100, fiberPer100g: 5 }, // 5 g fibre
      { grams: 100 }, // fiberPer100g absent → 0
    ]);
    expect(total.fiber).toBe(5);
  });

  it("retourne fiber: 0 pour une recette sans ingrédients", () => {
    expect(recipeMacros([]).fiber).toBe(0);
  });
});

describe("perServing / scaleServings — fibres", () => {
  it("divise puis remultiplie les fibres de façon cohérente", () => {
    const total = { calories: 400, protein: 40, carbs: 40, fat: 20, fiber: 20 };
    const per = perServing(total, 4);
    expect(per.fiber).toBe(5);
    expect(scaleServings(per, 2).fiber).toBe(10);
  });
});
