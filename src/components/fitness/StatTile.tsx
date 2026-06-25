import type { ReactNode } from "react";

export function StatTile({
  icon,
  label,
  value,
  unit,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-white/[0.04] px-2 py-2.5 ring-1 ring-white/5"
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="mt-0.5 flex items-baseline gap-0.5">
        <span className="text-base font-bold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-[9px] font-medium text-muted-foreground">{unit}</span>}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}
