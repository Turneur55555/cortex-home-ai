import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LatestActivity {
  date: string;
  steps: number | null;
  active_calories: number | null;
  avg_hr: number | null;
  resting_hr: number | null;
}

/**
 * Dernier relevé d'activité connu (table `daily_activity`, alimentée par
 * l'import Apple Health — voir HealthDataPanel). Retourne null tant
 * qu'aucune donnée n'a été importée.
 */
export function useLatestActivity() {
  return useQuery({
    queryKey: ["daily_activity", "latest"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LatestActivity | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("daily_activity")
        .select("date, steps, active_calories, avg_hr, resting_hr")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}

/**
 * Relevé d'activité pour une date PRÉCISE (contrairement à
 * `useLatestActivity`, qui renvoie le dernier relevé connu — pas
 * nécessairement aujourd'hui). Nécessaire pour tout calcul qui doit
 * correspondre à "la journée demandée" (ex. NEAT quotidien, Phase 2D) :
 * ne jamais présenter l'activité d'un autre jour comme celle du jour
 * demandé. `null` si aucune ligne n'existe pour cette date.
 */
export function useActivityForDate(dateYMD: string) {
  return useQuery({
    queryKey: ["daily_activity", "date", dateYMD],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LatestActivity | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("daily_activity")
        .select("date, steps, active_calories, avg_hr, resting_hr")
        .eq("user_id", user.id)
        .eq("date", dateYMD)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}
