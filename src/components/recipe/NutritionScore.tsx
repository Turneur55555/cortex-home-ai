import { memo } from "react";
import { cn } from "@/lib/utils";

type Props = {
  score: number;
  letter: "A" | "B" | "C" | "D" | "E";
  className?: string;
};

const LETTER_STYLES: Record<string, string> = {
  A: "bg-green-500/20 text-green-300 border-green-500/40",
  B: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  C: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  D: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  E: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

export const NutritionScore = memo(function NutritionScore({ score, letter, className }: Props) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-lg border text-[11px] font-bold",
          LETTER_STYLES[letter],
        )}
      >
        {letter}
      </span>
      <span className="text-[10px] text-muted-foreground">Score {score}/100</span>
    </div>
  );
});
