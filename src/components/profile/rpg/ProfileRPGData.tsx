import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { computeBroadActivity } from "@/lib/profile/muscleVolume";
import { RankAggregator, type RankAggregate } from "@/components/fitness/RankAggregator";

export interface ProfileRPGDataValue {
  rankAggregate: RankAggregate;
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  workouts: Array<{
    date: string;
    exercises: Array<{
      name: string;
      weight: number | null;
      sets: number | null;
      reps: number | null;
      /** Étape 4.6 : priorité d'identité (voir identityKey), additif. */
      exercise_reference_id: string | null;
    }>;
  }>;
  bestPR: { name: string; weight: number } | null;
}

/**
 * Câble toute la donnée Progression RPG (rangs) sur les hooks existants —
 * extrait de l'ancien couple ProfilPage/ProfilRPGBlock pour être réutilisé
 * par plusieurs écrans (hub Profil condensé, écran Progression RPG complet)
 * sans dupliquer le câblage. Aucun moteur touché : ne fait qu'observer
 * RankAggregator/computePRs.
 */
export function ProfileRPGData({
  children,
}: {
  children: (value: ProfileRPGDataValue) => React.ReactNode;
}) {
  const { data: workouts } = useWorkouts();
  const { prByName, histByName, volByName, nameByKey, topExercises } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );

  const workoutsSample = useMemo(
    () =>
      (workouts ?? []).map((w) => ({
        date: w.date,
        exercises: (w.exercises ?? []).map((ex) => ({
          name: ex.name,
          weight: ex.weight,
          sets: ex.sets,
          reps: ex.reps,
          exercise_reference_id: ex.exercise_reference_id ?? null,
        })),
      })),
    [workouts],
  );

  // Liste élargie (jusqu'à 8 exercices) pour une Progression RPG qui reflète
  // vraiment "toutes les données existantes", pas seulement le top 3 utilisé
  // historiquement pour les highlights de la fiche.
  const broadActivityProbe = useMemo(
    () => computeBroadActivity(workoutsSample, 8),
    [workoutsSample],
  );

  // Étape 4.6 : `broadExerciseKeys`/`topExercises` sont désormais des
  // `identityKey` (id-priority), pas des noms — `RankAggregator` (donc
  // `useExerciseProgression`/`useExerciseSetHistory`) attend un VRAI nom
  // d'exercice pour faire son propre matching. On résout donc chaque clé en
  // nom réel via le `nameByKey` correspondant (celui de `computeBroadActivity`
  // pour les clés `broadExercises`, celui de `computePRs` pour `topExercises`)
  // avant de les passer à RankAggregator — sinon la sonde ne trouverait plus
  // aucun historique (régression silencieuse, voir rapport d'audit Étape 4.6).
  const probeExerciseNames = useMemo(() => {
    const useBroad = broadActivityProbe.broadExercises.length > 0;
    const keys = useBroad ? broadActivityProbe.broadExercises : topExercises;
    const resolver = useBroad ? broadActivityProbe.nameByKey : nameByKey;
    const names = keys.map((k) => resolver.get(k)).filter((n): n is string => !!n);
    return names;
  }, [broadActivityProbe, topExercises, nameByKey]);

  const bestPR = useMemo(() => {
    let bestKey: string | null = null;
    let bestWeight = 0;
    for (const [key, weight] of prByName) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestKey = key;
      }
    }
    if (!bestKey) return null;
    return { name: nameByKey.get(bestKey) ?? bestKey, weight: bestWeight };
  }, [prByName, nameByKey]);

  return (
    <RankAggregator exerciseNames={probeExerciseNames}>
      {(rankAggregate) =>
        children({
          rankAggregate,
          topExercises,
          nameByKey,
          histByName,
          volByName,
          prByName,
          workouts: workoutsSample,
          bestPR,
        })
      }
    </RankAggregator>
  );
}
