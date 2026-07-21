import { RankIllustration } from "@/components/rpg/RankIllustration";
import type { RankState } from "@/lib/fitness/exerciseRanks";

/**
 * Médaillon de rang compact — même illustration officielle que partout
 * ailleurs dans l'app (`RankIllustration`), avec le niveau romain du palier
 * (info de progression propre à l'exercice, absente de l'illustration) en
 * pastille superposée.
 */
export function ExerciseRankBadge({ rank, size = 88 }: { rank: RankState; size?: number }) {
  const { glow } = rank.rank.colors;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ width: size, height: size, boxShadow: `0 10px 28px -14px ${glow}` }}
    >
      <RankIllustration
        rankKey={rank.rank.key}
        label={rank.rank.label}
        className="absolute inset-0 h-full w-full"
      />
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
        {rank.romanLevel}
      </span>
    </div>
  );
}
