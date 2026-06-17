import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// Historique nutritionnel agrégé par jour (pour tendances & moyennes).
export type DayNutrition = {
  date: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

const ZERO = { calories: 0, proteins: 0, carbs: 0, fats: 0 };

/**
 * Renvoie une série continue des `days` derniers jours calendaires
 * (jours sans repas = 0), triée par date croissante.
 */
export function useNutritionHistory(days = 30) {
  return useQuery({
    queryKey: ["nutrition_history", days],
    staleTime: 60_000,
    queryFn: async (): Promise<DayNutrition[]> => {
      const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("nutrition")
        .select("date, calories, proteins, carbs, fats")
        .gte("date", from)
        .order("date", { ascending: true });
      if (error) throw error;

      const map = new Map<string, DayNutrition>();
      for (const row of data ?? []) {
        const r = row as Record<string, number | string | null>;
        const d = String(r.date);
        const cur = map.get(d) ?? { date: d, ...ZERO };
        cur.calories += Number(r.calories ?? 0);
        cur.proteins += Number(r.proteins ?? 0);
        cur.carbs += Number(r.carbs ?? 0);
        cur.fats += Number(r.fats ?? 0);
        map.set(d, cur);
      }

      const series: DayNutrition[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        series.push(map.get(d) ?? { date: d, ...ZERO });
      }
      return series;
    },
  });
}

/** Moyenne sur les jours RÉELLEMENT suivis (calories > 0) dans la fenêtre. */
export function averageOverTrackedDays(series: DayNutrition[], n: number) {
  const tracked = series.slice(-n).filter((d) => d.calories > 0);
  if (tracked.length === 0) return { ...ZERO, trackedDays: 0 };
  const sum = tracked.reduce(
    (a, d) => ({
      calories: a.calories + d.calories,
      proteins: a.proteins + d.proteins,
      carbs: a.carbs + d.carbs,
      fats: a.fats + d.fats,
    }),
    { ...ZERO },
  );
  const k = tracked.length;
  return {
    calories: Math.round(sum.calories / k),
    proteins: Math.round(sum.proteins / k),
    carbs: Math.round(sum.carbs / k),
    fats: Math.round(sum.fats / k),
    trackedDays: k,
  };
}
