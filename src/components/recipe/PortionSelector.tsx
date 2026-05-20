import { memo } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
};

export const PortionSelector = memo(function PortionSelector({
  value,
  onChange,
  min = 1,
  max = 12,
  className,
}: Props) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Portions
      </span>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
});
