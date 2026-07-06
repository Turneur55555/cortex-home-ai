import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBadgeSystem } from "@/hooks/useBadgeSystem";
import { useAchievements, type AchievementAggregateWithLoading } from "@/hooks/useAchievements";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { computeBroadActivity } from "@/lib/profile/achievements/muscleVolume";
import { RankAggregator, type RankAggregate } from "@/components/fitness/RankAggregator";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";

export interface ProfileRPGDataValue {
  rankAggregate: RankAggregate;
  achievements: AchievementAggregateWithLoading;
  legacyBadges: BadgeWithProgress[];
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
    }>;
  }>;
  bestPR: { name: string; weight: number } | null;
  totalWorkouts: number;
}

/**
 * Câble toute la donnée Progression RPG (rangs, badges historiques, succès
 * additifs) sur les hooks existants — extrait de l'ancien couple
 * ProfilPage/ProfilRPGBlock pour être réutilisé par plusieurs écrans (hub
 * Profil condensé, écran Progression RPG complet, écran Salle des trophées
 * complet) sans dupliquer le câblage. Aucun moteur touché : ne fait
 * qu'observer RankAggregator/useAchievements/useBadgeSystem/computePRs.
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
  const badgeSystem = useBadgeSystem();

  const workoutsSample = useMemo(
    () =>
      (workouts ?? []).map((w) => ({
        date: w.date,
        exercises: (w.exercises ?? []).map((ex) => ({
          name: ex.name,
          weight: ex.weight,
          sets: ex.sets,
          reps: ex.reps,
        })),
      })),
    [workouts],
  );

  // Liste élargie (jusqu'à 8 exercices) pour une Progression RPG qui reflète
  // vraiment "toutes les données existantes", pas seulement le top 3 utilisé
  // historiquement pour les highlights de la fiche.
  const broadExerciseKeys = useMemo(
    () => computeBroadActivity(workoutsSample, 8).broadExercises,
    [workoutsSample],
  );
  const probeExerciseNames = broadExerciseKeys.length > 0 ? broadExerciseKeys : topExercises;

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
      {(rankAggregate) => (
        <ProfileRPGDataInner
          rankAggregate={rankAggregate}
          badgeSystem={badgeSystem}
          topExercises={topExercises}
          nameByKey={nameByKey}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
          workouts={workoutsSample}
          bestPR={bestPR}
        >
          {children}
        </ProfileRPGDataInner>
      )}
    </RankAggregator>
  );
}

/**
 * Rendu comme un vrai composant (et non comme un simple callback) : les
 * hooks appelés à l'intérieur (via useAchievements) doivent être attribués à
 * SON propre rendu React, pas à celui de <RankAggregator>. Appeler des hooks
 * directement dans la fonction "children" d'un render-prop casserait les
 * règles des hooks — passer par un composant dédié est la façon correcte de
 * consommer `rankAggregate` tout en calculant les succès.
 */
function ProfileRPGDataInner({
  rankAggregate,
  badgeSystem,
  topExercises,
  nameByKey,
  histByName,
  volByName,
  prByName,
  workouts,
  bestPR,
  children,
}: {
  rankAggregate: RankAggregate;
  badgeSystem: ReturnType<typeof useBadgeSystem>;
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  workouts: ProfileRPGDataValue["workouts"];
  bestPR: { name: string; weight: number } | null;
  children: (value: ProfileRPGDataValue) => React.ReactNode;
}) {
  const achievements = useAchievements(rankAggregate, badgeSystem);

  return (
    <>
      {children({
        rankAggregate,
        achievements,
        legacyBadges: badgeSystem.badgesWithProgress,
        topExercises,
        nameByKey,
        histByName,
        volByName,
        prByName,
        workouts,
        bestPR,
        totalWorkouts: badgeSystem.stats.workouts_count,
      })}
    </>
  );
}
