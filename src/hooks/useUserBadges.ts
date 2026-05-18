import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserBadge {
  id: string;
  badge_key: string;
  label: string;
  icon: string;
  unlocked_at: string;
}

export function useUserBadges(limit = 6) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_badges", user?.id, limit],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<UserBadge[]> => {
      const { data, error } = await (supabase as any)
        .from("user_badges")
        .select("id, badge_key, label, icon, unlocked_at")
        .eq("user_id", user!.id)
        .order("unlocked_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as UserBadge[];
    },
  });
}
