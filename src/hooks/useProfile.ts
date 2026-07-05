import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchProfile,
  upsertAvatarUrl,
  upsertDisplayName,
  type ProfileRow,
} from "@/services/profile";

// Clé incluant l'uid pour que chaque utilisateur ait son propre cache.
// (vidée globalement au logout par queryClient.clear() dans use-auth.tsx)
const PROFILE_BASE_QK = ["profile"] as const;
const profileQK = (uid: string) => [...PROFILE_BASE_QK, uid] as const;

export function useProfile(fallback: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const qk = user ? profileQK(user.id) : PROFILE_BASE_QK;

  const { data: row } = useQuery({
    queryKey: qk,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchProfile(user!.id),
  });

  // Source unique : users_profiles.display_name
  // Fallback contrôlé : email-prefix uniquement si null
  const pseudo = row?.display_name?.trim() || fallback;
  const avatarUrl = row?.avatar_url ?? null;

  const mutation = useMutation({
    mutationFn: (next: string) => upsertDisplayName(user!.id, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk });
      const prev = qc.getQueryData<ProfileRow | null>(qk);
      qc.setQueryData<ProfileRow | null>(qk, (old) => ({
        ...(old ?? { display_name: null, avatar_url: null }),
        display_name: next.trim(),
      }));
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx !== undefined) {
        qc.setQueryData<ProfileRow | null>(qk, ctx.prev ?? null);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (url: string) => upsertAvatarUrl(user!.id, url),
    onMutate: async (url) => {
      await qc.cancelQueries({ queryKey: qk });
      const prev = qc.getQueryData<ProfileRow | null>(qk);
      qc.setQueryData<ProfileRow | null>(qk, (old) => ({
        ...(old ?? { display_name: null, avatar_url: null }),
        avatar_url: url,
      }));
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx !== undefined) {
        qc.setQueryData<ProfileRow | null>(qk, ctx.prev ?? null);
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

  const updateAvatar = useCallback(
    (url: string) => avatarMutation.mutateAsync(url),
    [avatarMutation],
  );

  return { pseudo, avatarUrl, updatePseudo, updateAvatar, isPending: mutation.isPending };
}
