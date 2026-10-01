import type { WeekPlanView } from "@/hooks/useWeekPlanView";
import {
  ISO_DAYS,
  buildWeekView,
  emptyWeeklyPlan,
  plannedWeeklyLoad,
  summarizeTemplate,
  summarizeWeek,
  type PlanDay,
  type TemplateLike,
  type WeeklyPlan,
  type WorkoutLike,
} from "@/lib/fitness/weeklyPlan";

/** Mercredi 30/09/2026 : la semaine de référence des tests d'interface (lundi 28/09 → dimanche 04/10). */
export const TEST_TODAY = "2026-09-30";

/**
 * Fabrique une vue de semaine COMPLÈTE à partir du vrai domaine
 * (`buildWeekView`, `summarizeWeek`, `plannedWeeklyLoad`) — jamais d'états
 * écrits à la main, qui pourraient diverger de ce que l'app calcule vraiment.
 *
 * `templates: null` simule « modèles pas encore chargés ».
 */
export function makeWeekPlanView(
  options: {
    plan?: Partial<Record<number, PlanDay>>;
    templates?: TemplateLike[] | null;
    workouts?: WorkoutLike[];
    isLoading?: boolean;
    today?: string;
  } = {},
): WeekPlanView {
  const plan: WeeklyPlan = emptyWeeklyPlan();
  for (const [day, value] of Object.entries(options.plan ?? {})) {
    plan[Number(day) as 1] = value as PlanDay;
  }
  const loaded = options.templates === undefined ? [] : options.templates;
  const templates = (loaded ?? []).map(summarizeTemplate);
  const templatesById = loaded === null ? null : new Map(templates.map((t) => [t.id, t] as const));
  const today = options.today ?? TEST_TODAY;
  const week = buildWeekView(plan, options.workouts ?? [], today);

  return {
    isLoading: options.isLoading ?? false,
    today,
    plan,
    hasPlan: ISO_DAYS.some((day) => plan[day] !== null),
    week,
    summary: summarizeWeek(week),
    load: plannedWeeklyLoad(plan, templatesById ?? new Map()),
    templates,
    templatesById,
  };
}

export function template(
  id: string,
  name: string,
  sets: Array<number | null>,
  blocks = 0,
): TemplateLike {
  return {
    id,
    name,
    exercises: sets.map((default_sets) => ({ default_sets })),
    segments: Array.from({ length: blocks }, () => ({})),
  };
}
