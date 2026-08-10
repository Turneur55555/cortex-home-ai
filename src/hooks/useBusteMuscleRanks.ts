import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
import { muscleRanksFromWorkouts } from "@/hooks/useCortexPower";
import {
  busteEvolutionFromMuscleRanks,
  type BusteZoneEvolution,
} from "@/lib/fitness/rpg/busteEvolution";

const DEFAULT_BODYWEIGHT_KG = 75;

export interface BusteEvolutionSnapshot {
  isLoading: boolean;
  /** Une entrée par zone du buste (8), jamais plus/moins. */
  zones: BusteZoneEvolution[];
}

/**
 * Évolution des 8 zones du buste 3D, dérivée du Rang musculaire de chacune
 * (même moteur que `useCortexPower`, jamais dupliqué — voir
 * `muscleRanksFromWorkouts`). N'utilise JAMAIS le Titre global pour piloter
 * une zone individuelle (exigence RPG explicite, voir
 * docs/architecture/rpg-buste-3d-blender-workflow.md §6).
 */
export function useBusteMuscleRanks(): BusteEvolutionSnapshot {
  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: measurements, isLoading: bodyLoading } = useBodyMeasurements();

  return useMemo(() => {
    const loading = workoutsLoading || bodyLoading;
    if (loading) {
      return { isLoading: true, zones: [] };
    }
    const bodyweightKg =
      measurements?.find((m) => m.weight != null)?.weight ?? DEFAULT_BODYWEIGHT_KG;
    const muscleRanks = muscleRanksFromWorkouts(workouts, bodyweightKg);
    return { isLoading: false, zones: busteEvolutionFromMuscleRanks(muscleRanks) };
  }, [workouts, measurements, workoutsLoading, bodyLoading]);
}
