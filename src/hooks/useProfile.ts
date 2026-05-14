import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const PROFILE_QK = ["profile"] as const;

type ProfileRow = { display_name: string | null } | null | undefined;

export function useProfile(fallback: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: row } = useQuery({
    queryKey: PROFILE_QK,
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
      // Use UPDATE (not upsert) — handle_new_user trigger guarantees the row
      // exists for every authenticated user. Avoids the INSERT-policy premium
      // check and is unambiguous about intent.
      const { data, error } = await supabase
        .from("users_profiles")
        .update({ display_name: trimmed })
        .eq("id", user!.id)
        .select("display_name")
        .maybeSingle();
      if (error) throw error;
      // Row didn't exist (pre-trigger user) — create it now
      if (!data) {
        const { error: insertError } = await supabase
          .from("users_profiles")
          .insert({ id: user!.id, display_name: trimmed });
        if (insertError) throw insertError;
      }
      return trimmed;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: PROFILE_QK });
      const prev = qc.getQueryData<ProfileRow>(PROFILE_QK);
      qc.setQueryData<ProfileRow>(PROFILE_QK, (old) => ({
        ...old,
        display_name: next.trim(),
      }));
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx !== undefined) {
        qc.setQueryData<ProfileRow>(PROFILE_QK, ctx.prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_QK });
    },
  });

  const updatePseudo = useCallback(
    (next: string) => mutation.mutateAsync(next),
    [mutation],
  );

  return { pseudo, updatePseudo, isPending: mutation.isPending };
}
