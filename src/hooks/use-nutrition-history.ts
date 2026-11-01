import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DAY_COMPLETING_MEAL, type DayTotals } from "@/lib/nutrition/dayCompletion";

// Historique nutritionnel agrégé par jour (pour tendances & moyennes).
// Les moyennes ne comptent que les journées COMPLÈTES : voir
// `lib/nutrition/dayCompletion.ts::averageOverCompleteDays`.
export type DayNutrition = DayTotals & {
  /** Au moins un aliment saisi au dîner ce jour-là (journée complète d'office). */
  hasDinner: boolean;
};

const ZERO = { calories: 0, proteins: 0, carbs: 0, fats: 0, hasDinner: false };

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
        .select("date, meal, calories, proteins, carbs, fats")
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
        if (r.meal === DAY_COMPLETING_MEAL) cur.hasDinner = true;
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
