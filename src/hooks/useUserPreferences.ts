import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_ACCENT } from "@/lib/accent";

export interface UserPreferences {
  accent_color: string;
  animations_enabled: boolean;
  height_cm: number | null;
}

const DEFAULTS: UserPreferences = {
  accent_color: DEFAULT_ACCENT,
  animations_enabled: true,
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
      const { data, error } = await supabase
        .from("user_preferences")
        .select("accent_color, animations_enabled, height_cm")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULTS;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<UserPreferences>) => {
      const next = { ...(query.data ?? DEFAULTS), ...patch };
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ ...next, user_id: user!.id }, { onConflict: "user_id" });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => qc.setQueryData(qk, next),
    onError: () => toast.error("Impossible de mettre à jour les préférences"),
  });

  const safeUpdate = (patch: Partial<UserPreferences>) =>
    update.mutateAsync(patch).catch(() => { /* handled by onError */ });

  return {
    prefs: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    update: safeUpdate,
  };
}
