import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Teinte stable par titre, pour une couverture de remplacement qui ne ressemble pas à un trou. */
function hueOf(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

/**
 * Couverture d'un livre, dessinée comme un objet : dos ombré, coins légèrement arrondis, ombre
 * portée. Sans image (ou image cassée), une couverture typographique à la teinte du titre.
 */
export function BookCover({
  src,
  title,
  author,
  badge,
  className,
  rounded = "rounded-[6px]",
}: {
  src: string | null;
  title: string;
  author?: string | null;
  /** Petit badge en haut à gauche (« T2 »). */
  badge?: string | null;
  className?: string;
  rounded?: string;
}) {
  const [current, setCurrent] = useState(src);
  useEffect(() => setCurrent(src), [src]);

  const onError = () => {
    // Google : la variante haute définition (fife) n'existe pas toujours → on retente sans.
    if (current && /[?&]fife=/.test(current)) setCurrent(current.replace(/&fife=[^&]*/, ""));
    else setCurrent(null);
  };

  const hue = hueOf(title);

  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/10",
        rounded,
        className,
      )}
    >
      {current ? (
        <img
          src={current}
          alt={`Couverture de ${title}`}
          loading="lazy"
          decoding="async"
          onError={onError}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full flex-col justify-between p-[10%] text-left [container-type:inline-size]"
          style={{
            background: `linear-gradient(160deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 14%))`,
          }}
        >
          <span className="line-clamp-5 font-serif text-[clamp(9px,13cqw,22px)] font-semibold italic leading-tight text-white/95">
            {title}
          </span>
          {author && (
            <span className="line-clamp-2 text-[clamp(7px,7cqw,11px)] font-medium uppercase tracking-[0.12em] text-white/60">
              {author}
            </span>
          )}
        </div>
      )}
      {/* Dos du livre + reflet : la couverture devient un objet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/45 via-white/10 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/10"
      />
      {badge && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
          {badge}
        </span>
      )}
    </div>
  );
}

/** Fond d'ambiance : la couverture agrandie et floutée, fondue dans l'arrière-plan. */
export function BookBackdrop({ src, className }: { src: string | null; className?: string }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_50%_0%,var(--primary-glow-soft),transparent_70%)]",
          className,
        )}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] overflow-hidden",
        className,
      )}
    >
      <img src={src} alt="" className="h-full w-full scale-125 object-cover opacity-55 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-background" />
    </div>
  );
}
