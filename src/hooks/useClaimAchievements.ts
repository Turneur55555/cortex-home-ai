import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EvaluatedAchievement } from "@/lib/profile/achievements/types";

/**
 * Réclame l'XP des succès nouvellement débloqués via `claim_achievement`
 * (RPC, idempotente serveur — contrainte unique `user_achievements`).
 *
 * Ce hook ne revalide PAS les critères côté serveur (contrairement aux
 * badges) : le serveur borne seulement le montant et garantit l'unicité.
 * Un `ref` local évite de rappeler la RPC à chaque render pour les succès
 * déjà tentés dans cette session (le serveur est de toute façon idempotent,
 * ceci n'est qu'une politesse réseau).
 */
export function useClaimAchievements(all: EvaluatedAchievement[]) {
  const queryClient = useQueryClient();
  const attempted = useRef(new Set<string>());

  const claim = useMutation({
    mutationFn: async ({ id, xpReward }: { id: string; xpReward: number }) => {
      const { error } = await (supabase as any).rpc("claim_achievement", {
        _achievement_id: id,
        _xp_reward: xpReward,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user_stats"] });
    },
  });

  useEffect(() => {
    for (const item of all) {
      if (!item.unlocked) continue;
      if (attempted.current.has(item.def.id)) continue;
      attempted.current.add(item.def.id);
      claim.mutate({ id: item.def.id, xpReward: item.def.xpReward });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);
}
