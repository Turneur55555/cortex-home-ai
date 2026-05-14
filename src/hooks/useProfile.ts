import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const QK = ["profile"] as const;

export function useProfile(fallback: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: row } = useQuery({
    queryKey: QK,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Priority: saved display_name → OAuth full_name → email prefix fallback
  const pseudo =
    row?.display_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    fallback;

  const mutation = useMutation({
    mutationFn: async (next: string) => {
      const trimmed = next.trim();
      if (trimmed.length < 3 || trimmed.length > 20) {
        throw new Error("Le pseudo doit faire entre 3 et 20 caractères.");
      }
      const { error } = await supabase
        .from("users_profiles")
        .upsert({ id: user!.id, display_name: trimmed }, { onConflict: "id" });
      if (error) throw error;
      return trimmed;
    },
    onSuccess: (trimmed) => {
      qc.setQueryData(QK, (prev: { display_name: string | null } | null | undefined) => ({
        ...prev,
        display_name: trimmed,
      }));
    },
  });

  const updatePseudo = useCallback(
    (next: string) => mutation.mutateAsync(next),
    [mutation],
  );

  return { pseudo, updatePseudo, isPending: mutation.isPending };
}
