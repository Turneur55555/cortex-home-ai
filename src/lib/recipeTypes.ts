export type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  estimatedGrams: number;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fibers: number;
};

export type RecipeNutrition = {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fibers: number;
};

export type RecipeGoal = "seche" | "maintien" | "prise_de_masse" | "recomposition";

export type Recipe = {
  title: string;
  time_minutes: number;
  difficulty: string;
  servings: number;
  ingredients_used: RecipeIngredient[];
  missing_ingredients: Array<{ name: string }>;
  steps: string[];
  why_fits: string;
  nutrition_total: RecipeNutrition;
  tags: string[];
  goal_match: RecipeGoal | null;
};

export function safeNutrition(n?: Partial<RecipeNutrition> | null): RecipeNutrition {
  return {
    calories: Math.max(0, Math.round(n?.calories ?? 0)),
    proteins: Math.max(0, Math.round(n?.proteins ?? 0)),
    carbs: Math.max(0, Math.round(n?.carbs ?? 0)),
    fats: Math.max(0, Math.round(n?.fats ?? 0)),
    fibers: Math.max(0, Math.round(n?.fibers ?? 0)),
  };
}

export function scaleNutrition(n: RecipeNutrition, factor: number): RecipeNutrition {
  return {
    calories: Math.round(n.calories * factor),
    proteins: Math.round(n.proteins * factor),
    carbs: Math.round(n.carbs * factor),
    fats: Math.round(n.fats * factor),
    fibers: Math.round(n.fibers * factor),
  };
}

export const GOAL_LABELS: Record<RecipeGoal, string> = {
  seche: "Sèche",
  maintien: "Maintien",
  prise_de_masse: "Prise de masse",
  recomposition: "Recompo",
};
