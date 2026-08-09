import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";
import { identityKey } from "@/lib/fitness/recentExercises";
import { computeRanksByName } from "@/utils/fitness/exercise-stats";
import { aggregateMuscleRanks } from "@/lib/fitness/rpg/muscleAggregation";
import { computeCortexPower, type BusteMuscleGroup } from "@/lib/fitness/rpg/cortexPower";
import { titleForCortexPower, type CortexTitleProgress } from "@/lib/fitness/rpg/cortexTitle";

const DEFAULT_BODYWEIGHT_KG = 75;

export interface CortexPowerSnapshot {
  isLoading: boolean;
  title: CortexTitleProgress;
}

type WorkoutForPower = {
  exercises?: Array<{
    name: string;
    exercise_reference_id?: string | null;
  }> | null;
};

/**
 * Titre pour un jeu de séances donné — fonction pure réutilisée par
 * `useCortexPower` (état courant) et `useCortexPowerTransition` (avant/
 * après une séance, écran de récompense). Chaîne : séances → Rang exercice
 * (`rank/engine.ts`, inchangé) → Rang musculaire → Puissance Cortex →
 * Titre. Ne lit JAMAIS l'XP.
 */
export function titleFromWorkouts(
  workouts: WorkoutForPower[] | null | undefined,
  bodyweightKg: number,
): CortexTitleProgress {
  // computeRanksByName ne renvoie que Map<clé, RankState> (pas le nom) — le
  // nom est nécessaire pour exerciseToMuscles(). Reconstitution légère par
  // un seul passage sur les séances déjà chargées (pas de requête
  // supplémentaire), sans dupliquer la logique de calcul de rang.
  const nameByKey = new Map<string, string>();
  for (const w of workouts ?? []) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name?.trim()) continue;
      const key = identityKey({ name: ex.name, exercise_reference_id: ex.exercise_reference_id });
      if (!nameByKey.has(key)) nameByKey.set(key, ex.name.trim());
    }
  }

  const ranksByKey = computeRanksByName(workouts as never, bodyweightKg);
  const rankedExercises = Array.from(ranksByKey.entries()).map(([key, rank]) => ({
    key,
    name: nameByKey.get(key) ?? key,
    tierIndex: rank.tierIndex,
  }));

  const muscleRanks = aggregateMuscleRanks(rankedExercises);
  const powerInputs = Object.entries(muscleRanks).map(([muscle, result]) => ({
    muscle: muscle as BusteMuscleGroup,
    tierIndex: result.status === "evaluated" ? result.tierIndex : null,
  }));
  const power = computeCortexPower(powerInputs);

  return titleForCortexPower(power);
}

/**
 * Titre courant du joueur — SEULE source de vérité pour l'identité RPG
 * affichée dans l'app (Accueil, Profil, thème global, écrans de séance).
 * Ne lit JAMAIS `user_stats.xp`.
 *
 * Tant que le chargement (séances + poids de corps) n'est pas terminé, ne
 * rien inventer : état "partiel" à 0 muscle évalué, jamais un Titre par
 * défaut ("Mortel") qui flasherait avant la vraie valeur.
 */
export function useCortexPower(): CortexPowerSnapshot {
  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: measurements, isLoading: bodyLoading } = useBodyMeasurements();

  return useMemo(() => {
    const loading = workoutsLoading || bodyLoading;
    if (loading) {
      return {
        isLoading: true,
        title: titleForCortexPower({ status: "partial", evaluatedCount: 0 }),
      };
    }
    const bodyweightKg =
      measurements?.find((m) => m.weight != null)?.weight ?? DEFAULT_BODYWEIGHT_KG;
    return { isLoading: false, title: titleFromWorkouts(workouts, bodyweightKg) };
  }, [workouts, measurements, workoutsLoading, bodyLoading]);
}
