import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserStats } from "@/hooks/useUserStats";
import {
  totalSessionXp,
  buildXpBreakdown,
  buildLevelTransition,
  type SessionXpEvent,
  type XpBreakdownLine,
  type LevelTransition,
} from "@/lib/fitness/rpg/sessionReward";

export interface SessionRewardData {
  isLoading: boolean;
  /** XP totale versée pour CETTE séance (somme des xp_events). */
  totalXp: number;
  /** Détail par source, ordonné (muscu → records → soutien). */
  breakdown: XpBreakdownLine[];
  /** Transition de niveau induite par la séance. */
  level: LevelTransition;
  /** true tant qu'aucun xp_event n'existe (ex. migration R1 non déployée) —
   *  l'écran reste affichable (stats/PR/badges), la section XP est masquée. */
  hasXp: boolean;
}

/**
 * Récapitulatif d'XP d'une séance pour l'écran de récompense de fin de séance.
 * Lit `xp_events` (versés par le trigger serveur à la clôture) + l'XP totale
 * courante (`user_stats`). L'XP d'avant la séance se déduit sans snapshot :
 * `xpAfter − Σ(events de la séance)`. Lecture seule, aucun calcul d'économie
 * côté client (le serveur est l'autorité).
 */
export function useSessionReward(workoutId: string | null | undefined): SessionRewardData {
  const { user } = useAuth();
  const { data: userStats, isLoading: statsLoading } = useUserStats();

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["session_xp_events", workoutId, user?.id],
    enabled: !!user && !!workoutId,
    staleTime: 15_000,
    queryFn: async (): Promise<SessionXpEvent[]> => {
      const { data, error } = await supabase
        .from("xp_events")
        .select("source, amount")
        .eq("workout_id", workoutId!);
      if (error) throw error;
      return (data ?? []) as SessionXpEvent[];
    },
  });

  return useMemo(() => {
    const totalXp = totalSessionXp(events);
    const breakdown = buildXpBreakdown(events);
    const xpAfter = userStats?.xp ?? 0;
    const xpBefore = Math.max(0, xpAfter - totalXp);
    const level = buildLevelTransition(xpBefore, xpAfter);
    return {
      isLoading: statsLoading || eventsLoading,
      totalXp,
      breakdown,
      level,
      hasXp: totalXp > 0,
    };
  }, [events, userStats, statsLoading, eventsLoading]);
}
