import { getRankFlag } from "@/assets/rankFlags";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { rankFlagGlow, rankThemeByKey } from "@/components/rpg/rankTheme";
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
 * Taille "badge" (V2, 2026-07-30) — un repère de rang, jamais un bouton qui
 * dominerait le nom de l'exercice au-dessus. Un halo très discret (teinté
 * par la couleur officielle du rang, jamais réassemblé à la main — voir
 * rankTheme.ts) donne un peu de présence sans effet tape-à-l'œil. Un rang
 * sans fanion propre reste silencieux (aucun texte de repli tant que
 * l'asset n'est pas déposé) plutôt que d'improviser un rendu générique.
 */
export function RankFlag({ rankKey, label, className }: RankFlagProps) {
  const src = getRankFlag(rankKey);
  if (!src) return null;

  const { glow } = rankThemeByKey(rankKey);

  return (
    <img
      src={src}
      alt={`Rang ${label}`}
      loading="lazy"
      decoding="async"
      className={cn("h-6 w-auto object-contain", className)}
      style={{ filter: rankFlagGlow(glow, 6) }}
    />
  );
}
