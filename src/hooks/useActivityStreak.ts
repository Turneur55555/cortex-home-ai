import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Streak RÉEL calculé côté serveur (RPC get_user_streak_days) :
 * jours consécutifs avec au moins une activité (séance, repas loggé ou mensuration),
 * en fuseau Europe/Paris. Remplace l'ancien useStreak (localStorage, données fictives).
 */
export function useActivityStreak() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["activity_streak", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any).rpc("get_user_streak_days");
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
  return { current: query.data ?? 0, isLoading: query.isLoading };
}
