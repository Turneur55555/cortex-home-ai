import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TILE_CLASS =
  "flex items-center justify-between gap-2 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 px-3 py-3 text-left shadow-card backdrop-blur-xl transition-colors hover:border-primary/40";

interface TileBodyProps {
  icon: ReactNode;
  label: string;
  /** Pastille discrète, uniquement quand une intervention est nécessaire. */
  attention?: boolean;
  /** Ligne d'état sous le libellé (ex. état de la synchronisation). */
  subtitle?: ReactNode;
  /** Texte réservé aux lecteurs d'écran. */
  srHint?: string;
  /** Classes de la pastille d'icône (ton). */
  iconClassName?: string;
}

function TileBody({ icon, label, subtitle, srHint, attention, iconClassName }: TileBodyProps) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            iconClassName ?? "bg-primary/15 text-primary",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold">{label}</span>
          {subtitle && (
            <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>
          )}
          {srHint && <span className="sr-only">{srHint}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {attention && (
          <span
            aria-hidden
            data-testid="sync-attention-dot"
            className="h-1.5 w-1.5 rounded-full bg-destructive"
          />
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </span>
    </>
  );
}

/** Tuile de navigation de « Mes espaces » / « Mes paramètres » (lien). */
export function SpaceLink({ to, ...body }: TileBodyProps & { to: string }) {
  return (
    <Link to={to} className={TILE_CLASS}>
      <TileBody {...body} />
    </Link>
  );
}

/** Même tuile, mais ouvre un panneau au lieu de naviguer. */
export function SpaceButton({
  onClick,
  ariaLabel,
  ...body
}: TileBodyProps & { onClick: () => void; ariaLabel?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={TILE_CLASS}>
      <TileBody {...body} />
    </button>
  );
}
