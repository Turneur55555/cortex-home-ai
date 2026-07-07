import { useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { ExerciseRankBadge } from "@/components/fitness/ExerciseRankBadge";
import { toRankState } from "@/hooks/useExerciseProgression";
import { TOTAL_TIERS } from "@/lib/fitness/exerciseRanks";
import { StatChip, HighlightRow } from "@/components/profile/shared";
import { computeRecentPRs } from "@/utils/fitness/exercise-stats";
import type { RankAggregate, ProbeResult } from "@/components/fitness/RankAggregator";
import type { AchievementAggregateWithLoading } from "@/hooks/useAchievements";

/**
 * Carte "chemin du combattant" — remplace le carousel ExerciseRankStrip en
 * tête de page (déplacé dans l'écran dédié "Toutes les maîtrises"). Une
 * seule carte immersive qui raconte où en est l'utilisateur, inspirée de la
 * hiérarchie du Profil (même matériaux, même quintet d'informations que
 * `RPGProgressionSection`) mais avec une identité propre à Séances : un
 * blason de rang en médaillon (`ExerciseRankBadge`) plutôt qu'un avatar, une
 * seule carte cadrée plutôt qu'un empilement de blocs nus, et un bouton
 * "Voir toutes les maîtrises" qui renvoie vers l'écran dédié.
 */
export function SeancesProgressionCard({
  rankAggregate,
  achievements,
  topExercises,
  nameByKey,
  histByName,
  prByName,
  onViewAll,
}: {
  rankAggregate: RankAggregate;
  achievements: AchievementAggregateWithLoading;
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  prByName: Map<string, number>;
  onViewAll: () => void;
}) {
  const recentPRs = useMemo(
    () => computeRecentPRs(topExercises, prByName, histByName, nameByKey, 1),
    [topExercises, prByName, histByName, nameByKey],
  );

  const isLoading = rankAggregate.isLoading || achievements.isLoading;
  const best = rankAggregate.best;

  const nextRank = useMemo(() => {
    if (!best) return null;
    if (best.rank.isMax) return null;
    return toRankState(Math.min(TOTAL_TIERS - 1, best.rank.tierIndex + 1), 0);
  }, [best]);

  // Exercice le plus proche du niveau suivant : parmi tous les exercices
  // sondés (rankAggregate.reports), celui dont la Maîtrise est la plus
  // avancée sans avoir encore atteint le rang maximum.
  const closest = useMemo<ProbeResult | null>(() => {
    const candidates = rankAggregate.reports.filter((r) => !r.rank.isMax);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (b.rank.progress > a.rank.progress ? b : a));
  }, [rankAggregate.reports]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-40 w-full rounded-[26px]" />
      </div>
    );
  }

  if (!best) {
    return (
      <div className="rounded-[26px] border border-dashed border-white/[0.08] p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground/60">Aucun rang pour l'instant</p>
        <p className="mt-1 text-xs text-muted-foreground/40">
          Enregistre quelques séances pour démarrer ta progression RPG.
        </p>
      </div>
    );
  }

  const colors = best.rank.rank.colors;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-[26px] border border-white/[0.08] p-5 shadow-elevated"
      style={{
        background:
          `radial-gradient(120% 70% at 15% 0%, ${colors.glow} 0%, transparent 55%), ` +
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 14px 44px -24px ${colors.glow}`,
      }}
    >
      {/* Filet lumineux haut — même langage que Sensei^IA / La Forge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${colors.glow}, transparent)` }}
      />

      <div className="relative flex items-center gap-3">
        <ExerciseRankBadge rank={best.rank} size={56} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[9px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: colors.secondary }}
          >
            Ta légende
          </p>
          <p className="truncate font-serif text-[19px] font-semibold italic text-white">
            {best.rank.fullName}
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">
            {Math.round(best.rank.progress * 100)}% vers{" "}
            {nextRank ? nextRank.fullName : "le rang maximum"}
          </p>
        </div>
      </div>

      <div className="relative mt-3">
        <MasteryBar
          percent={best.rank.progress * 100}
          colors={colors}
          segments={5}
          height={10}
          showLabel={false}
        />
      </div>

      <div className="relative mt-3.5 grid grid-cols-2 gap-2">
        {closest && (
          <StatChip
            label="Proche du niveau suivant"
            value={nameByKey.get(closest.name) ?? closest.name}
            hint={`${Math.round(closest.rank.progress * 100)}% de Maîtrise`}
          />
        )}
        {recentPRs[0] && (
          <StatChip
            label="Dernière progression"
            value={`${recentPRs[0].weight} kg`}
            hint={recentPRs[0].name}
          />
        )}
      </div>

      {achievements.nextObjective && (
        <div className="relative mt-2">
          <HighlightRow
            icon={<Target className="h-3.5 w-3.5" />}
            label={`Prochaine récompense (${achievements.nextObjective.progress}%)`}
            title={achievements.nextObjective.def.title}
            rarity={achievements.nextObjective.def.rarity}
          />
        </div>
      )}

      {best.nextRankHint && (
        <div className="relative mt-2 flex items-start gap-2 rounded-xl bg-white/[0.02] p-2.5 ring-1 ring-white/[0.04]">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: colors.secondary }} />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              Conseil
            </p>
            <p className="text-[11px] leading-relaxed text-white/80">{best.nextRankHint}</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="group relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-[12px] font-semibold text-white/80 transition-colors hover:border-white/[0.18] hover:text-white"
      >
        Voir toutes les maîtrises
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </motion.div>
  );
}
