import { useMemo } from "react";
import type { useNutrition } from "./useNutritionData";
import type { useNutritionGoals } from "./useNutritionGoals";

type NutritionData = ReturnType<typeof useNutrition>["data"];
type NutritionGoalsData = ReturnType<typeof useNutritionGoals>["data"];

export type NutritionTotals = {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

export type NutritionRemaining = {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
} | null;

/**
 * Calories/macros consommées sur la journée + restant vs objectifs.
 * Extrait de NutritionTab.tsx (Problème 14 de l'audit) : pure dérivation de
 * `data`/`goals`, sans JSX ni effet de bord — comportement strictement
 * identique à l'ancien `useMemo` inline.
 */
export function useNutritionTotals(data: NutritionData, goals: NutritionGoalsData) {
  const totals = useMemo<NutritionTotals>(() => {
    return (data ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories ?? 0),
        proteins: acc.proteins + (m.proteins ?? 0),
        carbs: acc.carbs + (m.carbs ?? 0),
        fats: acc.fats + (m.fats ?? 0),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 },
    );
  }, [data]);

  // Macros restantes vs objectifs.
  const remaining = useMemo<NutritionRemaining>(() => {
    if (!goals) return null;
    const r = (g: number | null | undefined, v: number) =>
      g != null ? Math.round(g - v) : null;
    return {
      calories: r(goals.calories, totals.calories),
      proteins: r(goals.proteins, totals.proteins),
      carbs: r(goals.carbs, totals.carbs),
      fats: r(goals.fats, totals.fats),
    };
  }, [goals, totals]);

  return { totals, remaining };
}
