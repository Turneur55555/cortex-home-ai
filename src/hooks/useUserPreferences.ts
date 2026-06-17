import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserPreferences {
  user_id: string;
  theme: "dark" | "light";
  accent_color: string;
  units: "metric" | "imperial";
  animations_enabled: boolean;
  notifications_enabled: boolean;
  ai_preferences: Record<string, unknown>;
  height_cm: number | null;
}

const DEFAULTS: Omit<UserPreferences, "user_id"> = {
  theme: "dark",
  accent_color: "#6c63ff",
  units: "metric",
  animations_enabled: true,
  notifications_enabled: true,
  ai_preferences: {},
  height_cm: null,
};

export function useUserPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const qk = ["user_preferences", user?.id] as const;

  const query = useQuery({
    queryKey: qk,
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<UserPreferences> => {
      const { data, error } = await (supabase as any)
        .from("user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { user_id: user!.id, ...DEFAULTS };
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Omit<UserPreferences, "user_id">>) => {
      const next = { ...(query.data ?? { user_id: user!.id, ...DEFAULTS }), ...patch };
      const { error } = await (supabase as any)
        .from("user_preferences")
        .upsert({ ...next, user_id: user!.id }, { onConflict: "user_id" });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => qc.setQueryData(qk, next),
    onError: () => toast.error("Impossible de mettre à jour les préférences"),
  });

  const safeUpdate = (patch: Partial<Omit<UserPreferences, "user_id">>) =>
    update.mutateAsync(patch).catch(() => { /* handled by onError */ });

  return { prefs: query.data ?? { user_id: user?.id ?? "", ...DEFAULTS }, isLoading: query.isLoading, update: safeUpdate };
}
