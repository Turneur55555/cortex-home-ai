import { useCallback, useEffect, useMemo, useState } from "react";
import { useExerciseProgression, toRankState } from "@/hooks/useExerciseProgression";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import type { ExerciseBest } from "@/hooks/useExerciseProgression";

interface ProbeResult {
  name: string;
  rank: RankState;
  sessionCount: number;
  nextRankHint: string | null;
  best: ExerciseBest;
}

/**
 * Sonde invisible : appelle `useExerciseProgression` (hook existant, non
 * modifié) pour UN exercice et remonte son état au parent. Permet d'agréger
 * plusieurs rangs sans jamais appeler un hook dans une boucle (règle des
 * hooks) — même pattern que `MiniRankTile` dans `ExerciseRankStrip`.
 */
function RankProbe({ name, onReport }: { name: string; onReport: (r: ProbeResult) => void }) {
  const { rank, sessionCount, isLoading, nextRankHint, best } = useExerciseProgression(name);
  useEffect(() => {
    if (!isLoading) onReport({ name, rank, sessionCount, nextRankHint, best });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, rank.tierIndex, rank.progress, sessionCount, isLoading, nextRankHint, best.oneRM]);
  return null;
}

export type { ProbeResult };

export interface RankAggregate {
  isLoading: boolean;
  /** Meilleur rang obtenu, tous exercices sondés confondus. */
  best: ProbeResult | null;
  /** Rang moyen (index de palier moyen, converti en état affichable). */
  average: RankState | null;
  probedCount: number;
}

/**
 * Agrège le rang de plusieurs exercices (typiquement `topExercises` de
 * `computePRs`) sans dupliquer ni modifier le moteur Rang/Maîtrise : chaque
 * exercice est sondé via le hook existant, cette couche ne fait qu'observer
 * et calculer un maximum/une moyenne d'index déjà produits ailleurs.
 */
export function RankAggregator({
  exerciseNames,
  children,
}: {
  exerciseNames: string[];
  children: (aggregate: RankAggregate) => React.ReactNode;
}) {
  const [reports, setReports] = useState<Record<string, ProbeResult>>({});

  const handleReport = useCallback((r: ProbeResult) => {
    setReports((prev) => {
      const existing = prev[r.name];
      if (
        existing &&
        existing.rank.tierIndex === r.rank.tierIndex &&
        existing.sessionCount === r.sessionCount
      ) {
        return prev;
      }
      return { ...prev, [r.name]: r };
    });
  }, []);

  const aggregate = useMemo((): RankAggregate => {
    const values = exerciseNames.map((n) => reports[n]).filter(Boolean) as ProbeResult[];
    const withSessions = values.filter((v) => v.sessionCount > 0);
    const isLoading = values.length < exerciseNames.length;

    if (withSessions.length === 0) {
      return { isLoading, best: null, average: null, probedCount: withSessions.length };
    }

    const best = withSessions.reduce((a, b) => (b.rank.tierIndex > a.rank.tierIndex ? b : a));
    const avgTier = Math.round(
      withSessions.reduce((sum, v) => sum + v.rank.tierIndex, 0) / withSessions.length,
    );
    const average = toRankState(avgTier, 0);

    return { isLoading, best, average, probedCount: withSessions.length };
  }, [reports, exerciseNames]);

  return (
    <>
      {exerciseNames.map((name) => (
        <RankProbe key={name} name={name} onReport={handleReport} />
      ))}
      {children(aggregate)}
    </>
  );
}
