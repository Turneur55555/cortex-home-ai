import { useMemo } from "react";
import { useWeeklyPlanRows } from "@/hooks/useWeeklyPlan";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { isoDayOf, planDayLabel, resolveWeeklyPlan } from "@/lib/fitness/weeklyPlan";
import { generateOutfits, type GeneratedOutfit } from "@/lib/wardrobe/outfitEngine";
import type { WardrobePersonalization } from "@/hooks/useWardrobeInsights";

export interface DressingTrainingDay {
  /** « Épaule », « Dos + Bras »… ; null hors jour d'entraînement. */
  label: string | null;
  isTraining: boolean;
  isRest: boolean;
}

/**
 * Le jour de « Mon rythme » vu par le Dressing (Refonte, variante A) : séance
 * prévue aujourd'hui ou repos. Dérivé à la lecture, rien n'est stocké.
 */
export function useDressingTrainingDay(today: string): DressingTrainingDay {
  const rows = useWeeklyPlanRows();
  const templates = useWorkoutTemplates();
  return useMemo(() => {
    const day = resolveWeeklyPlan(rows.data ?? [])[isoDayOf(today)];
    if (!day || day.kind === "rest") return { label: null, isTraining: false, isRest: !!day };
    const name =
      day.kind === "template"
        ? (templates.data?.find((t) => t.id === day.templateId)?.name ?? null)
        : null;
    if (day.kind === "template" && !name) return { label: null, isTraining: true, isRest: false };
    return { label: planDayLabel(day, name), isTraining: true, isRest: false };
  }, [rows.data, templates.data, today]);
}

/**
 * Sac de salle : la meilleure tenue du contexte Sport, si le dressing contient
 * au moins une pièce de sport (sinon rien : on ne range pas une chemise dans
 * le sac).
 */
export function useGymBag(
  personalization: WardrobePersonalization,
  enabled: boolean,
): GeneratedOutfit | null {
  const { scoringItems, engineOptions } = personalization;
  return useMemo(() => {
    if (!enabled) return null;
    const result = generateOutfits(scoringItems, "sport", { ...engineOptions, maxResults: 1 });
    if (!result.ok) return null;
    const outfit = result.outfits[0];
    return outfit && outfit.items.some((i) => i.usage.includes("sport")) ? outfit : null;
  }, [enabled, scoringItems, engineOptions]);
}
