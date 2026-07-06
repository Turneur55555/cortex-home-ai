import { useMemo } from "react";
import { Award, Target, TrendingUp } from "lucide-react";
import { useWorkouts } from "@/hooks/use-fitness";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { useBadgeHighlights } from "@/hooks/useBadgeHighlights";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";
import { HighlightRow, StatChip } from "@/components/profile/BadgesStrip";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeRarity } from "@/lib/fitness/badges";

const MAX_RANK_PREVIEW = 4;

/**
 * Dérive les records personnels les plus récents à partir de l'historique
 * déjà calculé par `computePRs` (aucun nouveau calcul métier — on réutilise
 * `histByName`/`prByName` tels quels et on se contente de repérer la date la
 * plus récente à laquelle le record a été atteint).
 */
function useRecentPRs(limit = 2) {
  const { data, isLoading } = useWorkouts();
  const { prByName, histByName, nameByKey, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const recent = useMemo(() => {
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

  return { recent, isLoading };
}

export function AccomplishmentsPanel() {
  const { rarestUnlocked, nextObjective, unlockedCount, total, isLoading: badgesLoading } =
    useBadgeHighlights();
  const { goals, isLoading: goalsLoading } = useGoalsWithProgress();
  const { recent: recentPRs, isLoading: prsLoading } = useRecentPRs(2);
  const { data: workouts } = useWorkouts();
  const { topExercises, nameByKey, histByName, volByName, prByName } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );

  const mainGoals = useMemo(
    () => goals.filter((g) => !g.is_completed).sort((a, b) => b.progress - a.progress).slice(0, 2),
    [goals],
  );

  const isLoading = badgesLoading || goalsLoading || prsLoading;
  const hasContent = rarestUnlocked || nextObjective || recentPRs.length > 0 || mainGoals.length > 0;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Accomplissements
        </h2>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground/60">
            {unlockedCount}/{total} badges
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {/* Meilleurs rangs obtenus — réutilise ExerciseRankStrip tel quel */}
          {topExercises.length > 0 && (
            <ExerciseRankStrip
              topExercises={topExercises.slice(0, MAX_RANK_PREVIEW)}
              nameByKey={nameByKey}
              histByName={histByName}
              volByName={volByName}
              prByName={prByName}
            />
          )}

          {/* Badges rares + prochaine récompense */}
          {(rarestUnlocked || nextObjective) && (
            <div className="space-y-1.5">
              {rarestUnlocked && (
                <HighlightRow
                  icon={<Award className="h-3.5 w-3.5" />}
                  label="Badge le plus rare"
                  title={rarestUnlocked.catalog.label}
                  rarity={rarestUnlocked.catalog.rarity as BadgeRarity}
                />
              )}
              {nextObjective && (
                <HighlightRow
                  icon={<Target className="h-3.5 w-3.5" />}
                  label={`Prochaine récompense (${nextObjective.progress}%)`}
                  title={nextObjective.catalog.label}
                  rarity={nextObjective.catalog.rarity as BadgeRarity}
                />
              )}
            </div>
          )}

          {/* Derniers records personnels */}
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

          {/* Objectifs principaux */}
          {mainGoals.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                <TrendingUp className="h-3 w-3" />
                Objectifs principaux
              </div>
              <ul className="space-y-1.5">
                {mainGoals.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-white/80">{g.title}</span>
                    <span className="shrink-0 font-bold tabular-nums text-white/60">{g.progress}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasContent && (
            <p className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-muted-foreground/60">
              Continue à t'entraîner pour débloquer tes premiers accomplissements.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
