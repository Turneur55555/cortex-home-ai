import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useWeeklyPlanRows } from "@/hooks/useWeeklyPlan";
import {
  buildWeeklyReport,
  listWeeklyReports,
  weekReportTeaser,
  type WeekReportTeaser,
  type WeeklyReport,
  type WeeklyReportSummary,
} from "@/lib/fitness/weeklyReport";

/**
 * Les sources du rapport de semaine : les séances, le plan et la date du jour. Aucune
 * requête propre — tout vient de hooks offline-first, donc les bilans se lisent aussi
 * en salle, sans réseau, et rétroactivement pour toute l'histoire chargée.
 *
 * Les règles sont dans `lib/fitness/weeklyReport.ts` (pures et testées). Ce hook ne
 * fait que les alimenter. `isLoading` attend les deux lectures : sans le plan, un
 * bilan s'afficherait une demi-seconde sans sa comparaison « X / Y prévues ».
 */
function useReportSources() {
  const workoutsQuery = useWorkouts();
  const planQuery = useWeeklyPlanRows();
  const today = useLocalToday();
  return {
    isLoading: workoutsQuery.isLoading || planQuery.isLoading,
    workouts: workoutsQuery.data,
    planRows: planQuery.data,
    today,
  };
}

/** Le bilan d'une semaine (lundi `weekStart`). `report` vaut `null` si elle ne compte aucune séance. */
export function useWeekReport(weekStart: string): {
  isLoading: boolean;
  report: WeeklyReport | null;
} {
  const { isLoading, workouts, planRows } = useReportSources();
  const report = useMemo(
    () => buildWeeklyReport({ weekStart, workouts: workouts ?? [], planRows: planRows ?? [] }),
    [weekStart, workouts, planRows],
  );
  return { isLoading, report };
}

/** Les semaines passées qui ont un bilan, de la plus récente à la plus ancienne. */
export function useWeekReportList(): { isLoading: boolean; weeks: WeeklyReportSummary[] } {
  const { isLoading, workouts, planRows, today } = useReportSources();
  const weeks = useMemo(
    () =>
      listWeeklyReports({ workouts: workouts ?? [], planRows: planRows ?? [], todayDate: today }),
    [workouts, planRows, today],
  );
  return { isLoading, weeks };
}

/** Le bandeau « Ta semaine est prête » de l'Accueil (lundi et mardi), ou `null`. */
export function useWeekReportTeaser(): { isLoading: boolean; teaser: WeekReportTeaser | null } {
  const { isLoading, workouts, planRows, today } = useReportSources();
  const teaser = useMemo(
    () =>
      weekReportTeaser({ workouts: workouts ?? [], planRows: planRows ?? [], todayDate: today }),
    [workouts, planRows, today],
  );
  return { isLoading, teaser };
}
