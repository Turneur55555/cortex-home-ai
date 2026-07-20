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

  const { data: userStats } = useUserStats();
  const levelInfo = characterLevelProgress(userStats?.xp ?? 0);

  const isLoading = rankAggregate.isLoading || achievements.isLoading;
  const best = rankAggregate.best;

  const currentGrade = best ? gradeName(best.rank.levelInRank) : null;
  const nextGrade = best ? nextGradeLabel(best.rank) : null;

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
          <p className="text-sm font-medium text-muted-foreground/60">Aucun grade pour l'instant</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Enregistre quelques séances pour démarrer ta progression RPG.
          </p>
        </div>
      )}

      {!isLoading && best && (
        <div className="space-y-3">
          {/* Titre · Grade · XP restante */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-center">
            <p
              className="text-lg font-black uppercase tracking-[0.15em]"
              style={{ color: best.rank.rank.colors.secondary }}
            >
              {best.rank.rank.label}
            </p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              {currentGrade}
            </p>
            {!best.rank.isMax && nextGrade && (
              <p className="mt-2.5 text-[12px] font-semibold text-white/80">
                Plus que{" "}
                <span className="font-black" style={{ color: best.rank.rank.colors.secondary }}>
                  {formatXp(levelInfo.xpToNext)} XP
                </span>{" "}
                avant{" "}
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ color: best.rank.rank.colors.secondary }}
                >
                  {nextGrade}
                </span>
              </p>
            )}
            {best.rank.isMax && (
              <p
                className="mt-2.5 text-[12px] font-semibold"
                style={{ color: best.rank.rank.colors.secondary }}
              >
                Grade suprême atteint
              </p>
            )}
          </div>

          {/* Grade suivant + progression récente */}
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Prochain grade" value={nextGrade ?? "Grade suprême"} />
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
              label="Prochaine récompense"
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
