import { RankIllustration } from "@/components/rpg/RankIllustration";
import type { RankState } from "@/lib/fitness/exerciseRanks";

/**
 * Médaillon de rang compact — même illustration officielle, même cadrage
 * intégral 4:5 (aucun recadrage du disque ni du titre gravé) que partout
 * ailleurs dans l'app. `size` fixe la largeur ; la hauteur suit le ratio
 * 4:5. Le nom du rang vit uniquement dans l'illustration — tout texte de
 * progression (grade, niveau) est à la charge de l'appelant, sous le
 * médaillon, jamais en pastille superposée dessus.
 */
export function ExerciseRankBadge({ rank, size = 88 }: { rank: RankState; size?: number }) {
  const { glow } = rank.rank.colors;

  return (
    <div
      className="relative aspect-[4/5] overflow-hidden rounded-2xl"
      style={{ width: size, boxShadow: `0 10px 28px -14px ${glow}` }}
    >
      <RankIllustration
        rankKey={rank.rank.key}
        label={rank.rank.label}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
