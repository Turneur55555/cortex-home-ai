import type { ReactNode } from "react";

// Addendum 3 (2026-07-15, audit convergence UX) : `break-words`/`overflow-hidden`/
// `min-w-0` sont défensifs contre les valeurs longues (ex. "Endurance fondamentale",
// "~24h avant une séance intense") — sans eux, un mot non coupable déborde
// silencieusement de sa cellule de grille (StatTileRow) et chevauche la tuile
// voisine. Régression découverte en live sur une séance Course à 5 tuiles.
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
      className="flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl bg-white/[0.04] px-2 py-2.5 ring-1 ring-white/5"
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="mt-0.5 flex min-w-0 flex-wrap items-baseline justify-center gap-0.5">
        <span className="break-words text-center text-base font-bold leading-tight tracking-tight">
          {value}
        </span>
        {unit && <span className="text-[9px] font-medium text-muted-foreground">{unit}</span>}
      </span>
      <span className="line-clamp-2 break-words text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}
