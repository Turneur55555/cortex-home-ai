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
