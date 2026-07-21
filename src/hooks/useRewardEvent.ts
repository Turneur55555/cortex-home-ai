import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RewardSourceKey } from "@/lib/fitness/rpg/rewardSources";

/**
 * Point d'entrée UNIQUE, générique, pour déclarer un événement de
 * récompense au serveur (Reward Engine). Le client ne choisit jamais le
 * montant : il déclare qu'un événement whitelisté a eu lieu, le serveur
 * décide seul (catalogue `reward_catalog`, idempotence par `dedupKey`).
 *
 * Réutilisable pour TOUTE source présente ou future (PR d'exercice, rang
 * monté, Chronique découverte, chapitre validé, défi complété...) — aucun
 * nouveau hook à créer par fonctionnalité.
 */
export function useAwardRewardEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      source,
      dedupKey,
      workoutId,
    }: {
      source: RewardSourceKey;
      /** Identifiant unique de l'événement (idempotence) — ex. "exercise:<id>:pr_weight". */
      dedupKey?: string;
      workoutId?: string;
    }) => {
      const { error } = await (supabase as any).rpc("award_reward_event", {
        _source_key: source,
        _dedup_key: dedupKey ?? null,
        _workout_id: workoutId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user_stats"] });
    },
  });
}
