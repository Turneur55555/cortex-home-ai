import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Clé incluant l'uid pour que chaque utilisateur ait son propre cache.
// L'export de base sert à vider toutes les entrées profile au logout.
export const PROFILE_BASE_QK = ["profile"] as const;
const profileQK = (uid: string) => [...PROFILE_BASE_QK, uid] as const;

type ProfileRow = { display_name: string | null } | null | undefined;

export function useProfile(fallback: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const qk = user ? profileQK(user.id) : PROFILE_BASE_QK;

  const { data: row } = useQuery({
    queryKey: qk,
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

  // Source unique : users_profiles.display_name
  // Fallback contrôlé : email-prefix uniquement si null
  const pseudo = row?.display_name?.trim() || fallback;

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


      // Synchronisation auth metadata (fire-and-forget)
      void supabase.auth.updateUser({ data: { display_name: trimmed } }).catch(() => undefined);

      return trimmed;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk });
      const prev = qc.getQueryData<ProfileRow>(qk);
      qc.setQueryData<ProfileRow>(qk, (old) => ({
        ...old,
        display_name: next.trim(),
      }));
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx !== undefined) {
        qc.setQueryData<ProfileRow>(qk, ctx.prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk });
    },
  });

  const updatePseudo = useCallback(
    (next: string) => mutation.mutateAsync(next),
    [mutation],
  );

  return { pseudo, updatePseudo, isPending: mutation.isPending };
}
