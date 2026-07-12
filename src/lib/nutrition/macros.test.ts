import { describe, it, expect } from "vitest";
import { computeMacros, type ProductNutriments } from "./macros";

describe("computeMacros", () => {
  const standard: ProductNutriments = {
    "energy-kcal_100g": 200,
    proteins_100g: 20,
    carbohydrates_100g: 10,
    fat_100g: 5,
  };

  it("retourne null pour tous les macros si nutriments est undefined", () => {
    const result = computeMacros(undefined, 100);
    expect(result.calories).toBeNull();
    expect(result.proteins).toBeNull();
    expect(result.carbs).toBeNull();
    expect(result.fats).toBeNull();
  });

  it("calcule correctement les macros pour 100g de produit standard", () => {
    const result = computeMacros(standard, 100);
    expect(result.calories).toBe(200);
    expect(result.proteins).toBe(20);
    expect(result.carbs).toBe(10);
    expect(result.fats).toBe(5);
  });

  it("calcule correctement les macros pour une quantité de 200g", () => {
    const result = computeMacros(standard, 200);
    expect(result.calories).toBe(400);
    expect(result.proteins).toBe(40);
    expect(result.carbs).toBe(20);
    expect(result.fats).toBe(10);
  });

  it("calcule correctement les macros pour 50g (moitié de portion)", () => {
    const result = computeMacros(standard, 50);
    expect(result.calories).toBe(100);
    expect(result.proteins).toBe(10);
    expect(result.carbs).toBe(5);
    expect(result.fats).toBe(2.5);
  });

  it("retourne 0 calories et macros pour quantité 0g", () => {
    const result = computeMacros(standard, 0);
    expect(result.calories).toBe(0);
    expect(result.proteins).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fats).toBe(0);
  });

  it("arrondit les calories à l'entier le plus proche", () => {
    const nutriments: ProductNutriments = {
      "energy-kcal_100g": 333,
      proteins_100g: 10,
      carbohydrates_100g: 10,
      fat_100g: 10,
    };
    // 333 * 150 / 100 = 499.5 → arrondi à 500
    const result = computeMacros(nutriments, 150);
    expect(result.calories).toBe(500);
  });

  it("arrondit les protéines/glucides/lipides au dixième", () => {
    const nutriments: ProductNutriments = {
      "energy-kcal_100g": 100,
      proteins_100g: 13.3,
      carbohydrates_100g: 7.7,
      fat_100g: 3.3,
    };
    // 13.3 * 150 / 100 = 19.95 → arrondi 10ième = 20.0 → 20
    const result = computeMacros(nutriments, 150);
    expect(result.proteins).toBe(20);
    // 7.7 * 150 / 100 = 11.55 → arrondi 10ième = 11.6 (via Math.round(11.55 * 10) / 10)
    expect(result.carbs).toBe(11.6);
    // 3.3 * 150 / 100 = 4.95 → arrondi 10ième = 5
    expect(result.fats).toBe(5);
  });

  it("retourne null pour les champs manquants dans les nutriments", () => {
    const partialNutriments: ProductNutriments = {
      "energy-kcal_100g": 100,
      // proteins_100g, carbohydrates_100g, fat_100g absents
    };
    const result = computeMacros(partialNutriments, 100);
    expect(result.calories).toBe(100);
    expect(result.proteins).toBeNull();
    expect(result.carbs).toBeNull();
    expect(result.fats).toBeNull();
  });

  it("retourne null pour les nutriments avec un objet vide", () => {
    const result = computeMacros({}, 100);
    expect(result.calories).toBeNull();
    expect(result.proteins).toBeNull();
    expect(result.carbs).toBeNull();
    expect(result.fats).toBeNull();
  });

  it("gère les valeurs élevées correctement (produit très calorique)", () => {
    const rich: ProductNutriments = {
      "energy-kcal_100g": 900,
      proteins_100g: 0,
      carbohydrates_100g: 0,
      fat_100g: 100,
    };
    const result = computeMacros(rich, 30);
    expect(result.calories).toBe(270);
    expect(result.fats).toBe(30);
  });

  it("calcule les fibres comme les autres macros quand fournies", () => {
    const withFiber: ProductNutriments = { ...standard, fiber_100g: 8 };
    const result = computeMacros(withFiber, 150);
    // 8 * 150 / 100 = 12
    expect(result.fiber).toBe(12);
  });

  it("retourne null pour fiber si absente des nutriments", () => {
    const result = computeMacros(standard, 100);
    expect(result.fiber).toBeNull();
  });
});
