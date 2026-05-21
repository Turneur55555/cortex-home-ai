import { describe, it, expect } from "vitest";
import { safeNutrition, scaleNutrition, type RecipeNutrition } from "./recipeTypes";

const fullNutrition: RecipeNutrition = {
  calories: 500,
  proteins: 40,
  carbs: 30,
  fats: 15,
  fibers: 8,
};

describe("safeNutrition", () => {
  it("retourne des zéros pour undefined", () => {
    const result = safeNutrition(undefined);
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
    expect(result.fibers).toBe(0);
  });

  it("retourne des zéros pour null", () => {
    const result = safeNutrition(null);
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
    expect(result.fibers).toBe(0);
  });

  it("préserve les valeurs valides sans modification", () => {
    const result = safeNutrition(fullNutrition);
    expect(result.calories).toBe(500);
    expect(result.proteins).toBe(40);
    expect(result.carbs).toBe(30);
    expect(result.fats).toBe(15);
    expect(result.fibers).toBe(8);
  });

  it("arrondit les valeurs décimales à l'entier le plus proche", () => {
    const result = safeNutrition({ calories: 499.6, proteins: 39.4, carbs: 29.5, fats: 14.3, fibers: 7.8 });
    expect(result.calories).toBe(500);
    expect(result.proteins).toBe(39);
    expect(result.carbs).toBe(30);
    expect(result.fats).toBe(14);
    expect(result.fibers).toBe(8);
  });

  it("interdit les valeurs négatives (les force à 0 via Math.max)", () => {
    const result = safeNutrition({ calories: -100, proteins: -5, carbs: -10, fats: -2, fibers: -1 });
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
    expect(result.fibers).toBe(0);
  });

  it("gère un objet partiel avec des champs manquants (fallback à 0)", () => {
    const result = safeNutrition({ calories: 300 });
    expect(result.calories).toBe(300);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
    expect(result.fibers).toBe(0);
  });

  it("retourne un objet complet même si l'entrée est vide", () => {
    const result = safeNutrition({});
    expect(result).toHaveProperty("calories");
    expect(result).toHaveProperty("proteins");
    expect(result).toHaveProperty("carbs");
    expect(result).toHaveProperty("fats");
    expect(result).toHaveProperty("fibers");
  });
});

describe("scaleNutrition", () => {
  it("multiplie tous les champs par le facteur donné", () => {
    const result = scaleNutrition(fullNutrition, 2);
    expect(result.calories).toBe(1000);
    expect(result.proteins).toBe(80);
    expect(result.carbs).toBe(60);
    expect(result.fats).toBe(30);
    expect(result.fibers).toBe(16);
  });

  it("retourne 0 pour tous les champs si le facteur est 0", () => {
    const result = scaleNutrition(fullNutrition, 0);
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
    expect(result.fibers).toBe(0);
  });

  it("retourne les valeurs d'origine pour un facteur de 1", () => {
    const result = scaleNutrition(fullNutrition, 1);
    expect(result.calories).toBe(500);
    expect(result.proteins).toBe(40);
    expect(result.carbs).toBe(30);
    expect(result.fats).toBe(15);
    expect(result.fibers).toBe(8);
  });

  it("calcule correctement pour une fraction (0.5 portion)", () => {
    const result = scaleNutrition(fullNutrition, 0.5);
    expect(result.calories).toBe(250);
    expect(result.proteins).toBe(20);
    expect(result.carbs).toBe(15);
    expect(result.fats).toBe(8);  // 15 * 0.5 = 7.5 → arrondi 8
    expect(result.fibers).toBe(4);
  });

  it("arrondit les résultats à l'entier le plus proche", () => {
    const nutrition: RecipeNutrition = { calories: 100, proteins: 10, carbs: 10, fats: 10, fibers: 10 };
    // facteur 1/3 → 100/3 = 33.333... → arrondi 33
    const result = scaleNutrition(nutrition, 1 / 3);
    expect(result.calories).toBe(33);
    expect(result.proteins).toBe(3);
  });

  it("gère un facteur négatif (produit des valeurs négatives sans protection)", () => {
    const result = scaleNutrition(fullNutrition, -1);
    expect(result.calories).toBe(-500);
    expect(result.proteins).toBe(-40);
  });

  it("préserve les zéros d'un ingrédient nul quel que soit le facteur", () => {
    const zero: RecipeNutrition = { calories: 0, proteins: 0, carbs: 0, fats: 0, fibers: 0 };
    const result = scaleNutrition(zero, 10);
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
  });
});
