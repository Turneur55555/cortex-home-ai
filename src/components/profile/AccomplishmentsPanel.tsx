import { useMemo } from "react";
import { Dumbbell, Sparkles, Swords } from "lucide-react";
import { useWorkouts } from "@/hooks/use-fitness";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";
import { ExerciseRankBadge } from "@/components/fitness/ExerciseRankBadge";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { HighlightRow, StatChip } from "@/components/profile/BadgesStrip";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeRarity } from "@/lib/fitness/badges";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import type { BadgeHighlights } from "@/hooks/useBadgeHighlights";

const MAX_RANK_PREVIEW = 4;

/**
 * Dérive les records personnels les plus récents à partir de l'historique
 * déjà calculé par `computePRs` (aucun nouveau calcul métier — on réutilise
 * `histByName`/`prByName` tels quels et on se contente de repérer la date la
 * plus récente à laquelle le record a été atteint).
 */
function useRecentPRs(topExercises: string[], prByName: Map<string, number>, histByName: Map<string, { date: string; weight: number }[]>, nameByKey: Map<string, string>, limit = 2) {
  return useMemo(() => {
    const rows: { name: string; weight: number; date: string }[] = [];
    for (const key of topExercises) {
      const pr = prByName.get(key);
      const hist = histByName.get(key);
      if (!pr || !hist || hist.length === 0) continue;
      const atPr = [...hist].filter((h) => h.weight === pr).sort((a, b) => (a.date < b.date ? 1 : -1));
      if (atPr.length === 0) continue;
      rows.push({ name: nameByKey.get(key) ?? key, weight: pr, date: atPr[0].date });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
  }, [prByName, histByName, nameByKey, topExercises, limit]);
}

export function AccomplishmentsPanel({
  rankAggregate,
  badgeHighlights,
}: {
  rankAggregate: RankAggregate;
  badgeHighlights: BadgeHighlights;
}) {
  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { topExercises, nameByKey, histByName, volByName, prByName } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );
  const recentPRs = useRecentPRs(topExercises, prByName, histByName, nameByKey, 2);
  const { rarestUnlocked, nextObjective } = badgeHighlights;

  const mainExerciseKey = topExercises[0];
  const mainExerciseName = mainExerciseKey ? nameByKey.get(mainExerciseKey) ?? mainExerciseKey : null;

  const isLoading = workoutsLoading || rankAggregate.isLoading;
  const best = rankAggregate.best;
  const visual = best ? getRankVisual(best.rank.rank.key) : null;

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
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {/* Meilleur rang obtenu — le vrai médaillon, pas juste un texte */}
          {best && visual ? (
            <div
              className="relative overflow-hidden rounded-2xl p-4"
              style={{
                background: visual.atmosphere,
                boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 8px 30px -16px ${best.rank.rank.colors.glow}`,
              }}
            >
              <div className="relative flex items-center gap-4">
                <ExerciseRankBadge rank={best.rank} size={72} animated />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[9px] font-bold uppercase tracking-[0.3em]"
                    style={{ color: best.rank.rank.colors.secondary, opacity: 0.85 }}
                  >
                    Meilleur rang obtenu
                  </p>
                  <h3
                    className="mt-0.5 truncate font-serif text-lg font-bold uppercase tracking-wide"
                    style={{ color: best.rank.rank.colors.text }}
                  >
                    {best.rank.rank.label} {best.rank.romanLevel}
                  </h3>
                  <p className="truncate text-[11px] text-white/60">{best.name}</p>
                </div>
              </div>
              {best.nextRankHint && (
                <div className="relative mt-3 flex items-start gap-2 rounded-xl bg-black/25 p-2.5">
                  <Sparkles
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: best.rank.rank.colors.secondary }}
                  />
                  <span className="text-[11px] leading-relaxed text-white/80">{best.nextRankHint}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground/60">Aucun rang pour l'instant</p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                Enregistre quelques séances pour démarrer ta progression RPG.
              </p>
            </div>
          )}

          {/* Rang moyen + exercice principal */}
          <div className="grid grid-cols-2 gap-2">
            {rankAggregate.average && (
              <StatChip
                label="Rang moyen"
                value={`${rankAggregate.average.rank.label} ${rankAggregate.average.romanLevel}`}
              />
            )}
            {mainExerciseName && (
              <StatChip label="Exercice principal" value={mainExerciseName} hint="le plus pratiqué" />
            )}
          </div>

          {/* Progression RPG — mosaïque des rangs par exercice */}
          {topExercises.length > 0 && (
            <ExerciseRankStrip
              topExercises={topExercises.slice(0, MAX_RANK_PREVIEW)}
              nameByKey={nameByKey}
              histByName={histByName}
              volByName={volByName}
              prByName={prByName}
            />
          )}

          {/* Records récents */}
          {recentPRs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {recentPRs.map((pr) => (
                <StatChip
                  key={pr.name}
                  label="Record récent"
                  value={`${pr.weight} kg`}
                  hint={pr.name}
                />
              ))}
            </div>
          )}

          {/* Prochaine grande récompense + badge rare */}
          {(nextObjective || rarestUnlocked) && (
            <div className="space-y-1.5">
              {nextObjective && (
                <HighlightRow
                  icon={<Dumbbell className="h-3.5 w-3.5" />}
                  label={`Prochaine récompense (${nextObjective.progress}%)`}
                  title={nextObjective.catalog.label}
                  rarity={nextObjective.catalog.rarity as BadgeRarity}
                />
              )}
              {rarestUnlocked && (
                <HighlightRow
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Succès le plus rare"
                  title={rarestUnlocked.catalog.label}
                  rarity={rarestUnlocked.catalog.rarity as BadgeRarity}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
