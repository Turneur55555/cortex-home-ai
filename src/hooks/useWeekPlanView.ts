import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useWeeklyPlanRows } from "@/hooks/useWeeklyPlan";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import {
  ISO_DAYS,
  buildWeekView,
  plannedWeeklyLoad,
  resolveWeeklyPlan,
  summarizeTemplate,
  summarizeWeek,
  type PlannedLoad,
  type TemplateSummary,
  type WeekDayView,
  type WeekSummary,
  type WeeklyPlan,
} from "@/lib/fitness/weeklyPlan";

export interface WeekPlanView {
  /** Le plan (ou les séances) n'est pas encore lu depuis le store local. */
  isLoading: boolean;
  plan: WeeklyPlan;
  /** Au moins un jour est planifié (repos compris). */
  hasPlan: boolean;
  /** Lundi → dimanche, avec l'état de chaque jour. */
  week: WeekDayView[];
  summary: WeekSummary;
  /** Séries prévues sur la semaine, d'après les séances sauvegardées. */
  load: PlannedLoad;
  /** Les séances sauvegardées, la plus récente d'abord (ordre de `useWorkoutTemplates`). */
  templates: TemplateSummary[];
  /**
   * `null` tant que les modèles ne sont pas chargés : ne JAMAIS le confondre
   * avec « aucun modèle » (voir `resolveTemplateRef`).
   */
  templatesById: ReadonlyMap<string, TemplateSummary> | null;
}

/**
 * La semaine en cours telle qu'on l'affiche : le plan récurrent croisé avec les
 * séances réellement terminées (état fait / à faire dérivé, jamais stocké) et
 * les séances sauvegardées (nombre de séries).
 *
 * Ne contient aucune requête propre : tout vient de hooks offline-first, donc
 * le tout fonctionne hors connexion.
 */
export function useWeekPlanView(): WeekPlanView {
  const rowsQuery = useWeeklyPlanRows();
  const templatesQuery = useWorkoutTemplates();
  const workoutsQuery = useWorkouts();
  const today = useLocalToday();

  const plan = useMemo(() => resolveWeeklyPlan(rowsQuery.data ?? []), [rowsQuery.data]);

  const templates = useMemo(
    () => (templatesQuery.data ?? []).map(summarizeTemplate),
    [templatesQuery.data],
  );

  const templatesById = useMemo(
    () => (templatesQuery.data ? new Map(templates.map((t) => [t.id, t] as const)) : null),
    [templatesQuery.data, templates],
  );

  const week = useMemo(
    () => buildWeekView(plan, workoutsQuery.data ?? [], today),
    [plan, workoutsQuery.data, today],
  );

  const summary = useMemo(() => summarizeWeek(week), [week]);

  const load = useMemo(
    () => plannedWeeklyLoad(plan, templatesById ?? new Map()),
    [plan, templatesById],
  );

  const hasPlan = useMemo(() => ISO_DAYS.some((day) => plan[day] !== null), [plan]);

  return {
    isLoading: rowsQuery.isLoading,
    plan,
    hasPlan,
    week,
    summary,
    load,
    templates,
    templatesById,
  };
}
