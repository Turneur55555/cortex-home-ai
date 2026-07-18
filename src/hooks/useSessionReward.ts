import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserStats } from "@/hooks/useUserStats";
import {
  totalSessionXp,
  buildXpBreakdown,
  buildLevelTransition,
  buildLevelTransitionFromServer,
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

interface WorkoutRewardSnapshot {
  xp_before: number | null;
  xp_after: number | null;
  level_before: number | null;
  level_after: number | null;
}

/**
 * Récapitulatif d'XP d'une séance pour l'écran de récompense de fin de séance.
 * Lit `xp_events` (détail par source) + les compteurs AUTORITATIFS versés par
 * le serveur sur la séance elle-même (`workouts.xp_before/xp_after/
 * level_before/level_after`, migration `20260718120000`). Le serveur est
 * l'unique autorité : plus de reconstruction `xpAfter − events` côté client.
 * Repli sur `user_stats.xp` uniquement pour les séances antérieures à la
 * migration (colonnes NULL).
 */
export function useSessionReward(workoutId: string | null | undefined): SessionRewardData {
  const { user } = useAuth();
  const { data: userStats, isLoading: statsLoading } = useUserStats();

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["session_xp_events", workoutId, user?.id],
    enabled: !!user && !!workoutId,
    staleTime: 15_000,
    queryFn: async (): Promise<SessionXpEvent[]> => {
      const { data, error } = await (supabase as any)
        .from("xp_events")
        .select("source, amount")
        .eq("workout_id", workoutId!);
      if (error) throw error;
      return (data ?? []) as SessionXpEvent[];
    },
  });

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ["session_reward_snapshot", workoutId],
    enabled: !!user && !!workoutId,
    staleTime: 15_000,
    queryFn: async (): Promise<WorkoutRewardSnapshot | null> => {
      const { data, error } = await (supabase as any)
        .from("workouts")
        .select("xp_before, xp_after, level_before, level_after")
        .eq("id", workoutId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkoutRewardSnapshot | null;
    },
  });

  return useMemo(() => {
    const totalXp = totalSessionXp(events);
    const breakdown = buildXpBreakdown(events);

    const hasServerSnapshot =
      snapshot?.xp_before != null &&
      snapshot?.xp_after != null &&
      snapshot?.level_before != null &&
      snapshot?.level_after != null;

    const level = hasServerSnapshot
      ? buildLevelTransitionFromServer(
          snapshot!.xp_before!,
          snapshot!.xp_after!,
          snapshot!.level_before!,
          snapshot!.level_after!,
        )
      : buildLevelTransition(Math.max(0, (userStats?.xp ?? 0) - totalXp), userStats?.xp ?? 0);

    return {
      isLoading: statsLoading || eventsLoading || snapshotLoading,
      totalXp,
      breakdown,
      level,
      hasXp: totalXp > 0,
    };
  }, [events, snapshot, userStats, statsLoading, eventsLoading, snapshotLoading]);
}
