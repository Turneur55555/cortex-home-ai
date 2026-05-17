import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserStats {
  xp: number;
  level: number;
  total_actions: number;
}

export function useUserStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_stats", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<UserStats> => {
      const { data, error } = await (supabase as any)
        .from("user_stats")
        .select("xp, level, total_actions")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { xp: 0, level: 1, total_actions: 0 };
    },
  });
}
