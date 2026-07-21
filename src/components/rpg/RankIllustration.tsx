import { getRankIllustration } from "@/assets/ranks";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { cn } from "@/lib/utils";

interface RankIllustrationProps {
  rankKey: RankKey;
  label: string;
  className?: string;
}

/**
 * Illustration officielle du rang courant — remplit son conteneur
 * (`object-fit: cover`). Ne contient aucune logique par rang : la
 * correspondance rang → fichier vit dans `assets/ranks`.
 */
export function RankIllustration({ rankKey, label, className }: RankIllustrationProps) {
  const src = getRankIllustration(rankKey);

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/20 text-muted-foreground",
          className,
        )}
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em]">{label}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Illustration du rang ${label}`}
      loading="lazy"
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}
