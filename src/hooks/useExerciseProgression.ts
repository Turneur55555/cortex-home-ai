import { useMemo } from "react";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
import { computeRankState, computeSessionMetrics } from "@/lib/fitness/rank/engine";
import { DEFAULT_RANK_ENGINE_CONFIG } from "@/lib/fitness/rank/config";
import { RANK_TIERS, LEVELS_PER_RANK, TOTAL_TIERS, type RankState } from "@/lib/fitness/exerciseRanks";

const ROMAN = ["I", "II", "III", "IV", "V"];
/** Poids de corps utilisé tant que l'utilisateur n'en a renseigné aucun. */
const DEFAULT_BODYWEIGHT_KG = 75;

export function toRankState(confirmedTierIndex: number, masteryPercent: number): RankState {
  const idx = Math.max(0, Math.min(TOTAL_TIERS - 1, confirmedTierIndex));
  const rank = RANK_TIERS[Math.floor(idx / LEVELS_PER_RANK)];
  const levelInRank = (idx % LEVELS_PER_RANK) + 1;
  return {
    tierIndex: idx,
    rank,
    levelInRank,
    romanLevel: ROMAN[levelInRank - 1],
    fullName: `${rank.label} ${ROMAN[levelInRank - 1]}`,
    xp: masteryPercent,
    currentTierXp: masteryPercent,
    nextTierXp: 100,
    xpToNext: Math.max(0, 100 - masteryPercent),
    progress: masteryPercent / 100,
    isMax: idx >= TOTAL_TIERS - 1,
  };
}

export interface ExerciseBest {
  tonnage: number;
  weight: number;
  reps: number;
  oneRM: number;
}

export interface ExerciseProgressionSnapshot {
  isLoading: boolean;
  /** null tant que l'historique/le poids de corps ne sont pas chargés — ne
   *  jamais retomber sur un rang par défaut ("Mortel") pendant ce délai. */
  rank: RankState | null;
  masteryPercent: number;
  /** Message motivant vers le rang suivant (remplace la liste d'objectifs). */
  nextRankHint: string | null;
  best: ExerciseBest;
  sessionCount: number;
  /** false = poids de corps par défaut utilisé, le rang est approximatif. */
  bodyweightKnown: boolean;
}

export function useExerciseProgression(
  exerciseName: string | null | undefined,
): ExerciseProgressionSnapshot {
  const { data, isLoading: historyLoading } = useExerciseSetHistory(exerciseName);
  const { data: measurements, isLoading: bodyLoading } = useBodyMeasurements();

  return useMemo(() => {
    const sessions = (data ?? []).map((s) => ({
      workoutId: s.workoutId,
      date: s.date,
      sets: s.sets.map((x) => ({ reps: x.reps, weight: x.weight })),
    }));

    const latestWeight = measurements?.find((m) => m.weight != null)?.weight ?? null;
    const bodyweightKg = latestWeight ?? DEFAULT_BODYWEIGHT_KG;

    const best: ExerciseBest = { tonnage: 0, weight: 0, reps: 0, oneRM: 0 };
    for (const s of sessions) {
      const m = computeSessionMetrics(s);
      if (m.tonnage > best.tonnage) best.tonnage = m.tonnage;
      if (m.topWeight > best.weight) {
        best.weight = m.topWeight;
        best.reps = m.topReps;
      } else if (m.topWeight === best.weight && m.topReps > best.reps) {
        best.reps = m.topReps;
      }
      if (m.best1RM > best.oneRM) best.oneRM = m.best1RM;
    }

    const loading = historyLoading || bodyLoading;

    // Tant que l'historique/le poids de corps sont en cours de chargement,
    // `sessions` vaut [] — un `computeRankState` calculé dessus retomberait
    // sur le tier 0 ("Mortel") comme s'il n'y avait vraiment aucune séance.
    // On ne calcule donc le rang qu'une fois le chargement terminé.
    const result =
      !loading && exerciseName
        ? computeRankState(DEFAULT_RANK_ENGINE_CONFIG, exerciseName, sessions, bodyweightKg)
        : null;

    return {
      isLoading: loading,
      rank: loading
        ? null
        : toRankState(result?.confirmedTierIndex ?? 0, result?.masteryPercent ?? 0),
      masteryPercent: loading ? 0 : (result?.masteryPercent ?? 0),
      nextRankHint: loading ? null : (result?.nextRankHint ?? null),
      best,
      sessionCount: sessions.length,
      bodyweightKnown: latestWeight != null,
    };
  }, [data, measurements, historyLoading, bodyLoading, exerciseName]);
}
