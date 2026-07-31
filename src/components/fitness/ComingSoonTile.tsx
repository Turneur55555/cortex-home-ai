import type { ReactNode } from "react";

/**
 * Tuile jumelle de StatTile (même gabarit) pour un indicateur pas encore
 * disponible — style atténué + bordure pointillée, pour cohabiter dans la
 * même grille que des tuiles réelles sans casser l'alignement.
 */
export function ComingSoonTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-2 py-3">
      <span className="text-muted-foreground/40">{icon}</span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        À venir
      </span>
      <span className="line-clamp-2 break-words text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
    </div>
  );
}
