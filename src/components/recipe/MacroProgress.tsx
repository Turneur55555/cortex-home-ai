import { memo } from "react";
import { cn } from "@/lib/utils";
import { type RecipeNutrition } from "@/lib/recipeTypes";

type Props = {
  nutrition: RecipeNutrition;
  className?: string;
};

const MACRO_CONFIG = [
  { key: "proteins" as const, label: "P", color: "bg-blue-400", max: 60 },
  { key: "carbs" as const, label: "G", color: "bg-amber-400", max: 120 },
  { key: "fats" as const, label: "L", color: "bg-rose-400", max: 60 },
  { key: "fibers" as const, label: "Fi", color: "bg-green-400", max: 30 },
];

export const MacroProgress = memo(function MacroProgress({ nutrition, className }: Props) {
  const total = nutrition.proteins + nutrition.carbs + nutrition.fats;
  if (total === 0) return null;

  return (
    <div className={cn("flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full", className)}>
      {MACRO_CONFIG.slice(0, 3).map(({ key, color }) => {
        const val = nutrition[key];
        const pct = total > 0 ? (val / total) * 100 : 0;
        return (
          <div
            key={key}
            className={cn("h-full rounded-full transition-all duration-500", color)}
            style={{ width: `${pct}%` }}
          />
        );
      })}
    </div>
  );
});
