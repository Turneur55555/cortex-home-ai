import { useMemo } from "react";
import { Sparkles, Swords, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatChip, HighlightRow } from "@/components/profile/shared";
import { computeRecentPRs } from "@/utils/fitness/exercise-stats";
import { gradeName, nextGradeLabel, formatXp } from "@/lib/fitness/rpg/grade";
import { useUserStats } from "@/hooks/useUserStats";
import { characterLevelProgress } from "@/lib/fitness/rpg/characterLevel";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import type { AchievementAggregateWithLoading } from "@/hooks/useAchievements";

/**
 * Progression RPG — répond à UNE seule question : "Où en suis-je ?".
 * Ne répète jamais le Hero (qui affiche déjà le rang global une seule fois
 * en sous-titre) : ici, uniquement la progression vers la suite —
 * progression globale, prochain rang, prochaine récompense, progression
 * récente, conseil. La Salle des trophées et les Quêtes ont leurs propres
 * sections sur le Profil (TrophyRoomPreview / QuestsPreview) et leurs
 * écrans dédiés — plus embarquées ici.
 */
export function RPGProgressionSection({
  rankAggregate,
  achievements,
  topExercises,
  nameByKey,
  histByName,
  prByName,
}: {
  rankAggregate: RankAggregate;
  achievements: AchievementAggregateWithLoading;
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
}) {
  const recentPRs = useMemo(
    () => computeRecentPRs(topExercises, prByName, histByName, nameByKey, 2),
    [topExercises, prByName, histByName, nameByKey],
  );

  const isLoading = rankAggregate.isLoading || achievements.isLoading;
  const best = rankAggregate.best;

  const nextRank = useMemo(() => {
    if (!best) return null;
    if (best.rank.isMax) return null;
    return toRankState(Math.min(TOTAL_TIERS - 1, best.rank.tierIndex + 1), 0);
  }, [best]);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Progression RPG
        </h2>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && !best && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground/60">Aucun rang pour l'instant</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Enregistre quelques séances pour démarrer ta progression RPG.
          </p>
        </div>
      )}

      {!isLoading && best && (
        <div className="space-y-3">
          {/* Progression globale */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/80">
                {Math.round(best.rank.progress * 100)}% vers{" "}
                {nextRank ? nextRank.fullName : "le rang maximum"}
              </p>
            </div>
            <div className="mt-2.5">
              <MasteryBar
                percent={best.rank.progress * 100}
                colors={best.rank.rank.colors}
                segments={5}
                height={10}
                showLabel={false}
              />
            </div>
          </div>

          {/* Prochain rang + progression récente */}
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Prochain rang" value={nextRank ? nextRank.fullName : "Rang maximum"} />
            {recentPRs[0] && (
              <StatChip
                label="Progression récente"
                value={`${recentPRs[0].weight} kg`}
                hint={recentPRs[0].name}
              />
            )}
          </div>

          {/* Prochaine récompense */}
          {achievements.nextObjective && (
            <HighlightRow
              icon={<Target className="h-3.5 w-3.5" />}
              label={`Prochaine récompense (${achievements.nextObjective.progress}%)`}
              title={achievements.nextObjective.def.title}
              rarity={achievements.nextObjective.def.rarity}
            />
          )}

          {/* Conseil */}
          {best.nextRankHint && (
            <div className="flex items-start gap-2 rounded-xl bg-white/[0.02] p-2.5 ring-1 ring-white/[0.04]">
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: best.rank.rank.colors.secondary }}
              />
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  Conseil
                </p>
                <p className="text-[11px] leading-relaxed text-white/80">{best.nextRankHint}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
