import { ImageOff } from "lucide-react";
import { getPlaceholderIllustration, getRankIllustration } from "@/assets/ranks";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { cn } from "@/lib/utils";

interface RankIllustrationProps {
  rankKey: RankKey;
  label: string;
  className?: string;
}

/**
 * Illustration officielle du rang courant — seul composant qui représente un
 * rang dans toute l'app. Remplit son conteneur (`object-fit: cover`, ancré
 * en haut : voir `assets/ranks/FORMAT.md` pour le format que chaque fichier
 * doit respecter pour s'afficher correctement partout sans adaptation).
 *
 * Aucune logique par rang : un rang sans illustration propre retombe sur
 * `placeholder.webp`, puis sur une carte « Illustration à venir » — jamais
 * sur l'illustration d'un autre rang.
 */
export function RankIllustration({ rankKey, label, className }: RankIllustrationProps) {
  const src = getRankIllustration(rankKey) ?? getPlaceholderIllustration();

  if (!src) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border border-dashed border-white/15 bg-gradient-to-b from-white/[0.05] to-transparent text-white/50",
          className,
        )}
      >
        <ImageOff className="h-6 w-6 opacity-60" aria-hidden />
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">{label}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] opacity-60">
            Illustration à venir
          </p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Illustration du rang ${label}`}
      loading="lazy"
      decoding="async"
      className={cn("object-cover object-top", className)}
    />
  );
}
