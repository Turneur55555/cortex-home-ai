import { useMemo } from "react";
import { type Recipe, type RecipeNutrition, safeNutrition, scaleNutrition } from "@/lib/recipeTypes";

export type NutritionTag =
  | "Riche en protéines"
  | "Faible en calories"
  | "Riche en fibres"
  | "Faible en glucides"
  | "Équilibré"
  | "Haute satiété";

function computeTags(perServing: RecipeNutrition, tags: string[]): NutritionTag[] {
  const auto: NutritionTag[] = [];
  if (perServing.proteins >= 25) auto.push("Riche en protéines");
  if (perServing.calories <= 400) auto.push("Faible en calories");
  if (perServing.fibers >= 8) auto.push("Riche en fibres");
  if (perServing.carbs <= 20) auto.push("Faible en glucides");
  if (perServing.proteins + perServing.fibers >= 35) auto.push("Haute satiété");
  // "Équilibré" si aucun tag extrême
  if (auto.length === 0) auto.push("Équilibré");

  // Merge avec les tags IA, dédupliquer
  const all = [...new Set([...auto, ...(tags as NutritionTag[])])];
  return all.slice(0, 5);
}

function nutritionScore(n: RecipeNutrition): number {
  let score = 50;
  // Protéines: +1 par gramme jusqu'à 40
  score += Math.min(20, n.proteins * 0.5);
  // Fibres: +2 par gramme jusqu'à 10
  score += Math.min(20, n.fibers * 2);
  // Pénalité calories: -0.02 par kcal au-delà de 400
  score -= Math.max(0, (n.calories - 400) * 0.02);
  // Pénalité lipides > 30g
  score -= Math.max(0, (n.fats - 30) * 0.3);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreLetter(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

export function useNutritionCalculator(recipe: Recipe, portions: number) {
  return useMemo(() => {
    const total = safeNutrition(recipe.nutrition_total);
    const servings = Math.max(1, recipe.servings || 1);
    const factor = portions / servings;
    const perServing = scaleNutrition(total, factor);
    const score = nutritionScore(perServing);
    const letter = scoreLetter(score);
    const tags = computeTags(perServing, recipe.tags ?? []);

    return { total, perServing, score, letter, tags };
  }, [recipe, portions]);
}
