import { Swords } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { gradeName, nextGradeLabel, formatXp } from "@/lib/fitness/rpg/grade";
import { useUserStats } from "@/hooks/useUserStats";
import { characterLevelProgress } from "@/lib/fitness/rpg/characterLevel";
import type { RankAggregate } from "@/components/fitness/RankAggregator";

/**
 * Progression RPG — la référence pour tout ce qui concerne les grades.
 * Hiérarchie : Grade actuel (petit libellé gris) → nom du grade (blanc,
 * proéminent) → barre de progression → "Plus que X XP avant [grade]".
 * Seuls l'XP restante et le prochain grade utilisent la couleur dorée.
 */
export function RPGProgressionSection({ rankAggregate }: { rankAggregate: RankAggregate }) {
  const { data: userStats, isLoading: xpLoading } = useUserStats();
  const levelInfo = characterLevelProgress(userStats?.xp ?? 0);

  const isLoading = rankAggregate.isLoading || xpLoading;
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

      {isLoading && <Skeleton className="h-28 w-full rounded-2xl" />}

      {!isLoading && !best && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground/60">Aucun grade pour l'instant</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Enregistre quelques séances pour démarrer ta progression RPG.
          </p>
        </div>
      )}

      {!isLoading && best && currentGrade && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          {/* Grade actuel — libellé discret + nom proéminent */}
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Grade actuel
            </p>
            <p className="mt-1 text-[15px] font-black uppercase tracking-[0.1em] text-white">
              {currentGrade}
            </p>
          </div>

          {/* Barre de progression */}
          <div
            className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-valuenow={Math.round(levelInfo.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${levelInfo.progress * 100}%`,
                background: best.rank.rank.colors.gradient,
              }}
            />
          </div>

          {/* XP restante avant le prochain grade */}
          <p className="mt-2.5 text-center text-[12px] font-semibold text-white/80">
            {best.rank.isMax || !nextGrade ? (
              "Grade suprême atteint"
            ) : (
              <>
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
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
