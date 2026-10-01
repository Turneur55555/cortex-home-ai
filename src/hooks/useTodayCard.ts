import { useMemo } from "react";
import { useActiveWorkout, useWorkouts } from "@/hooks/use-fitness";
import { useWeekPlanView } from "@/hooks/useWeekPlanView";
import { resolveTodayCard, type TodayCardState } from "@/lib/fitness/todayCard";

export interface TodayCardView {
  /**
   * L'une des sources n'est pas encore lue depuis le store local. On attend les
   * TROIS : sans les séances, un jour déjà fait s'afficherait une demi-seconde
   * comme « à faire » ; sans la séance en cours, « Démarrer » précéderait
   * « Reprendre ».
   */
  isLoading: boolean;
  state: TodayCardState;
}

/**
 * La Carte du jour de l'Accueil : ce que l'app dit au joueur ce matin.
 *
 * Ne contient aucune requête propre et aucune règle : tout vient de hooks
 * offline-first (le plan, les séances, la séance en cours, les modèles), et la
 * règle est `resolveTodayCard` (`lib/fitness/todayCard.ts`, pure et testée).
 * L'écran fonctionne donc hors connexion, en salle.
 */
export function useTodayCard(): TodayCardView {
  const plan = useWeekPlanView();
  const activeQuery = useActiveWorkout();
  const workoutsQuery = useWorkouts();

  const active = activeQuery.data ?? null;
  const workouts = workoutsQuery.data;

  const state = useMemo(
    () =>
      resolveTodayCard({
        week: plan.week,
        todayDate: plan.today,
        templatesById: plan.templatesById,
        activeWorkout: active ? { name: active.name, created_at: active.created_at } : null,
        workouts: workouts ?? [],
      }),
    [plan.week, plan.today, plan.templatesById, active, workouts],
  );

  return {
    isLoading: plan.isLoading || activeQuery.isLoading || workoutsQuery.isLoading,
    state,
  };
}
