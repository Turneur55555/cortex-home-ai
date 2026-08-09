import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
import { titleFromWorkouts } from "@/hooks/useCortexPower";
import { titleForCortexPower, type CortexTitleProgress } from "@/lib/fitness/rpg/cortexTitle";

const DEFAULT_BODYWEIGHT_KG = 75;

export interface CortexPowerTransition {
  isLoading: boolean;
  before: CortexTitleProgress;
  after: CortexTitleProgress;
  /** true si le Titre OU le Grade a changé pendant la séance. */
  gradeUp: boolean;
}

/**
 * Transition de Titre/Grade induite par UNE séance (écran de récompense de
 * fin de séance) — recalcule la Puissance Cortex sur l'historique des
 * séances SANS la séance en cours ("avant") puis AVEC ("après"). Remplace
 * `buildTitleTransition` (`lib/fitness/rpg/sessionReward.ts`, XP avant/
 * après) pour que la transition affichée reste cohérente avec le Titre
 * affiché partout ailleurs dans l'app (`useCortexPower`) — une seule
 * source de vérité, y compris pour cet écran.
 */
export function useCortexPowerTransition(workoutId: string | null | undefined): CortexPowerTransition {
  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: measurements, isLoading: bodyLoading } = useBodyMeasurements();

  return useMemo(() => {
    const loading = workoutsLoading || bodyLoading;
    const notRanked = titleForCortexPower({ status: "partial", evaluatedCount: 0 });
    if (loading) {
      return { isLoading: true, before: notRanked, after: notRanked, gradeUp: false };
    }

    const bodyweightKg =
      measurements?.find((m) => m.weight != null)?.weight ?? DEFAULT_BODYWEIGHT_KG;

    const after = titleFromWorkouts(workouts, bodyweightKg);
    const beforeWorkouts = workoutId ? (workouts ?? []).filter((w) => w.id !== workoutId) : workouts;
    const before = titleFromWorkouts(beforeWorkouts, bodyweightKg);

    const gradeUp =
      after.status === "ranked" &&
      (before.status !== "ranked" || after.tierIndex > before.tierIndex);

    return { isLoading: false, before, after, gradeUp };
  }, [workouts, measurements, workoutsLoading, bodyLoading, workoutId]);
}
