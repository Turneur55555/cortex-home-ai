import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface ActivityItem {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useUserActivity(limit = 5) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_activity", user?.id, limit],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await (supabase as any)
        .from("user_activity")
        .select("id, type, label, metadata, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ActivityItem[];
    },
  });
}
