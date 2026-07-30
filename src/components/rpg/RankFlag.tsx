import { getRankFlag } from "@/assets/rankFlags";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { cn } from "@/lib/utils";

interface RankFlagProps {
  rankKey: RankKey;
  label: string;
  className?: string;
}

/**
 * Fanion officiel du rang — identité visuelle du rang dans les contextes
 * compacts (carte de séance). Remplace définitivement le texte coloré de
 * rang : image auto-porteuse (icône + nom déjà gravés), toujours affichée
 * en entier (`object-contain`, jamais recadrée) et centrée par l'appelant.
 * Un rang sans fanion propre reste silencieux (aucun texte de repli tant
 * que l'asset n'est pas déposé) plutôt que d'improviser un rendu générique.
 */
export function RankFlag({ rankKey, label, className }: RankFlagProps) {
  const src = getRankFlag(rankKey);
  if (!src) return null;

  return (
    <img
      src={src}
      alt={`Rang ${label}`}
      loading="lazy"
      decoding="async"
      className={cn("h-9 w-auto object-contain", className)}
    />
  );
}
