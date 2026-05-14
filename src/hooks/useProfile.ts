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

  // Single source of truth: users_profiles.display_name.
  // Fallback to email prefix only when the column is null/empty.
  // Never read user_metadata.full_name — it can diverge from the DB.
  const pseudo = row?.display_name?.trim() || fallback;

  const mutation = useMutation({
    mutationFn: async (next: string) => {
      const trimmed = next.trim();
      if (trimmed.length < 3 || trimmed.length > 20) {
        throw new Error("Le pseudo doit faire entre 3 et 20 caractères.");
      }

      // 1. Update DB profile (authoritative source of truth)
      const { data, error } = await supabase
        .from("users_profiles")
        .update({ display_name: trimmed })
        .eq("id", user!.id)
        .select("display_name")
        .maybeSingle();
      if (error) throw error;

      // 2. Row missing (pre-trigger legacy user) — create it
      if (!data) {
        const { error: insertError } = await supabase
          .from("users_profiles")
          .insert({ id: user!.id, display_name: trimmed });
        if (insertError) throw insertError;
      }

      // 3. Mirror to auth metadata so JWT stays consistent with DB.
      //    Fire-and-forget — a metadata sync failure must not block the save.
      void supabase.auth.updateUser({ data: { display_name: trimmed } }).catch(() => undefined);

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
