import { useMemo } from "react";
import { Dumbbell, Sparkles, Swords, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";
import { ExerciseRankBadge } from "@/components/fitness/ExerciseRankBadge";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { StatChip, HighlightRow } from "@/components/profile/shared";
import { TrophyRoom } from "@/components/profile/rpg/TrophyRoom";
import { QuestsPanel } from "@/components/profile/rpg/QuestsPanel";
import {
  computeBroadActivity,
  CATALOG_GROUPS,
  type WorkoutLike,
} from "@/lib/profile/achievements/muscleVolume";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import type { AchievementAggregateWithLoading } from "@/hooks/useAchievements";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";

const MAX_RANK_PREVIEW = 8;

function useRecentPRs(
  topExercises: string[],
  prByName: Map<string, number>,
  histByName: Map<string, { date: string; weight: number }[]>,
  nameByKey: Map<string, string>,
  limit = 2,
) {
  return useMemo(() => {
    const rows: { name: string; weight: number; date: string }[] = [];
    for (const key of topExercises) {
      const pr = prByName.get(key);
      const hist = histByName.get(key);
      if (!pr || !hist || hist.length === 0) continue;
      const atPr = [...hist]
        .filter((h) => h.weight === pr)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      if (atPr.length === 0) continue;
      rows.push({ name: nameByKey.get(key) ?? key, weight: pr, date: atPr[0].date });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
  }, [prByName, histByName, nameByKey, topExercises, limit]);
}

/**
 * Progression RPG — cœur du module Profil. Reconstruit automatiquement le
 * profil du joueur à partir de TOUTES les données déjà calculées ailleurs :
 * rangs (RankAggregator/moteur Rang existant), records (computePRs
 * existant), badges historiques (useBadgeSystem existant) et le nouveau
 * système de succès additif (useAchievements). Intègre aussi la Salle des
 * trophées et les Quêtes — plus de cartes indépendantes pour ces deux blocs.
 */
export function RPGProgressionSection({
  rankAggregate,
  achievements,
  legacyBadges,
  topExercises,
  nameByKey,
  histByName,
  volByName,
  prByName,
  workouts,
}: {
  rankAggregate: RankAggregate;
  achievements: AchievementAggregateWithLoading;
  legacyBadges: BadgeWithProgress[];
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  workouts: WorkoutLike[];
}) {
  const recentPRs = useRecentPRs(topExercises, prByName, histByName, nameByKey, 2);
  const broad = useMemo(() => computeBroadActivity(workouts, MAX_RANK_PREVIEW), [workouts]);

  const mainExerciseKey = topExercises[0];
  const mainExerciseName = mainExerciseKey
    ? (nameByKey.get(mainExerciseKey) ?? mainExerciseKey)
    : null;

  const isLoading = rankAggregate.isLoading || achievements.isLoading;
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
                  <span className="text-[11px] leading-relaxed text-white/80">
                    {best.nextRankHint}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground/60">
                Aucun rang pour l'instant
              </p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                Enregistre quelques séances pour démarrer ta progression RPG.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {rankAggregate.average && (
              <StatChip
                label="Rang global"
                value={`${rankAggregate.average.rank.label} ${rankAggregate.average.romanLevel}`}
              />
            )}
            {mainExerciseName && (
              <StatChip
                label="Exercice principal"
                value={mainExerciseName}
                hint="le plus pratiqué"
              />
            )}
            {broad.dominantMuscleGroup && (
              <StatChip
                label="Catégorie dominante"
                value={broad.dominantMuscleGroup}
                hint={`${broad.categoriesTrainedCount}/${CATALOG_GROUPS.length} travaillées`}
              />
            )}
            <StatChip
              label="Activité récente"
              value={`${broad.distinctWeeksActive} semaine${broad.distinctWeeksActive > 1 ? "s" : ""}`}
              hint={`${broad.distinctMonthsActive} mois actifs`}
            />
          </div>

          {topExercises.length > 0 && (
            <ExerciseRankStrip
              topExercises={broad.broadExercises.length > 0 ? broad.broadExercises : topExercises}
              nameByKey={nameByKey}
              histByName={histByName}
              volByName={volByName}
              prByName={prByName}
            />
          )}

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

          {(achievements.nextObjective || achievements.rarestUnlocked) && (
            <div className="space-y-1.5">
              {achievements.nextObjective && (
                <HighlightRow
                  icon={<Dumbbell className="h-3.5 w-3.5" />}
                  label={`Prochaine récompense (${achievements.nextObjective.progress}%)`}
                  title={achievements.nextObjective.def.title}
                  rarity={achievements.nextObjective.def.rarity}
                />
              )}
              {achievements.rarestUnlocked && (
                <HighlightRow
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Succès le plus rare"
                  title={achievements.rarestUnlocked.def.title}
                  rarity={achievements.rarestUnlocked.def.rarity}
                />
              )}
            </div>
          )}

          <div className="pt-2">
            <TrophyRoom
              achievements={achievements}
              legacyBadges={legacyBadges}
              isLoading={isLoading}
            />
          </div>

          <div className="pt-2">
            <QuestsPanel />
          </div>
        </div>
      )}
    </section>
  );
}
