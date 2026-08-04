import type { ReactNode } from "react";

/**
 * Grande carte "à venir" — utilisée pour des blocs entiers pas encore
 * développés (ex. Analyse IA de la Santé nutritionnelle). Même famille
 * visuelle que les cartes premium (dégradé + halo), volontairement plus
 * sobre pour signaler l'état non-final.
 */
export function ComingSoonCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-primary/10 via-card/90 to-card/70 p-5 shadow-card">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
