import { memo } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  variant?: "tag" | "goal";
  className?: string;
};

const GOAL_COLORS: Record<string, string> = {
  "Sèche": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Maintien": "bg-green-500/15 text-green-300 border-green-500/30",
  "Prise de masse": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Recompo": "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export const NutritionBadge = memo(function NutritionBadge({ label, variant = "tag", className }: Props) {
  const goalStyle = GOAL_COLORS[label];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
        variant === "goal" && goalStyle
          ? goalStyle
          : "border-primary/20 bg-primary/10 text-primary",
        className,
      )}
    >
      {variant === "tag" && <span className="opacity-70">✓</span>}
      {label}
    </span>
  );
});
