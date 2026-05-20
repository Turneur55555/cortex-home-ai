import { memo } from "react";
import { cn } from "@/lib/utils";
import { type RecipeNutrition } from "@/lib/recipeTypes";
import { MacroProgress } from "./MacroProgress";

type Props = {
  nutrition: RecipeNutrition;
  className?: string;
};

export const RecipeMacros = memo(function RecipeMacros({ nutrition, className }: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-bold">🔥 {nutrition.calories} kcal</span>
        <span className="text-sm font-semibold text-blue-400">💪 {nutrition.proteins}g P</span>
        <span className="text-sm font-semibold text-amber-400">🍞 {nutrition.carbs}g G</span>
        <span className="text-sm font-semibold text-rose-400">🥑 {nutrition.fats}g L</span>
        <span className="text-sm font-semibold text-green-400">🌿 {nutrition.fibers}g Fi</span>
      </div>
      <MacroProgress nutrition={nutrition} />
    </div>
  );
});
