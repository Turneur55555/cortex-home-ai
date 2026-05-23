import { useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useStreak } from "@/hooks/useStreak";
import {
  computeBadgeProgress,
  type BadgeCatalogEntry,
  type FitnessStats,
} from "@/lib/fitness/badges";

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

export interface UnlockedBadge {
  badge_key: string;
  unlocked_at: string;
  rarity: string;
  xp_reward: number;
  description: string;
}

export interface BadgeWithProgress {
  catalog: BadgeCatalogEntry;
  isUnlocked: boolean;
  unlockedAt?: string;
  progress: number;
}

export function useBadgeSystem() {
  const { user } = useAuth();
  const { current: streakDays } = useStreak();
  const qc = useQueryClient();
  const unlockingRef = useRef(new Set<string>());

  // Catalog
  const { data: catalog = [] } = useQuery({
    queryKey: ["badges_catalog"],
    staleTime: 300_000,
    queryFn: async (): Promise<BadgeCatalogEntry[]> => {
      const { data, error } = await (supabase as any)
        .from("badges_catalog")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BadgeCatalogEntry[];
    },
  });

  // User unlocked badges
  const { data: userBadges = [], isLoading } = useQuery({
    queryKey: ["user_badges", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<UnlockedBadge[]> => {
      const { data, error } = await (supabase as any)
        .from("user_badges")
        .select("badge_key, unlocked_at, rarity, xp_reward, description")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as UnlockedBadge[];
    },
  });

  // Fitness stats for progress calculation
  const { data: totalWorkouts = 0 } = useQuery({
    queryKey: ["workouts_total_count"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workouts")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const weekStart = getWeekStart();
  const { data: weeklyWorkouts = 0 } = useQuery({
    queryKey: ["workouts_weekly_count", weekStart],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("id")
        .gte("date", weekStart);
      if (error) throw error;
      return data?.length ?? 0;
    },
  });

  const { data: completedGoals = 0 } = useQuery({
    queryKey: ["goals_completed_count", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_completed", true);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const { data: bodyMeasurements = 0 } = useQuery({
    queryKey: ["body_measurements_count"],
    enabled: !!user,
    staleTime: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("body_tracking")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: proteinDays = 0 } = useQuery({
    queryKey: ["protein_days_count"],
    enabled: !!user,
    staleTime: 300_000,
    queryFn: async () => {
      if (!user) return 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: goalData } = await supabase
        .from("nutrition_goals")
        .select("proteins")
        .eq("user_id", user.id)
        .maybeSingle();
      const target = goalData?.proteins ?? 150;

      const { data: rows } = await supabase
        .from("nutrition")
        .select("date, proteins")
        .gte("date", dateFrom);
      if (!rows) return 0;

      const byDate = new Map<string, number>();
      for (const row of rows) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + (row.proteins ?? 0));
      }
      let count = 0;
      for (const total of byDate.values()) {
        if (total >= target) count++;
      }
      return count;
    },
  });

  const stats: FitnessStats = useMemo(() => ({
    workouts_count: totalWorkouts,
    weekly_workouts: weeklyWorkouts,
    streak_days: streakDays,
    protein_days: proteinDays,
    goals_completed: completedGoals,
    body_measurements: bodyMeasurements,
  }), [totalWorkouts, weeklyWorkouts, streakDays, proteinDays, completedGoals, bodyMeasurements]);

  const unlockedKeys = useMemo(
    () => new Set(userBadges.map((b) => b.badge_key)),
    [userBadges],
  );

  const badgesWithProgress = useMemo((): BadgeWithProgress[] => {
    return catalog.map((badge) => {
      const unlocked = unlockedKeys.has(badge.badge_key);
      const userBadge = userBadges.find((b) => b.badge_key === badge.badge_key);
      const progress = unlocked ? 100 : computeBadgeProgress(badge, stats);
      return {
        catalog: badge,
        isUnlocked: unlocked,
        unlockedAt: userBadge?.unlocked_at,
        progress,
      };
    });
  }, [catalog, unlockedKeys, userBadges, stats]);

  const unlockMutation = useMutation({
    mutationFn: async (badge: BadgeCatalogEntry) => {
      if (!user) return;
      await (supabase as any).from("user_badges").upsert(
        {
          user_id: user.id,
          badge_key: badge.badge_key,
          label: badge.label,
          icon: badge.icon,
          rarity: badge.rarity,
          xp_reward: badge.xp_reward,
          description: badge.description,
          unlocked_at: new Date().toISOString(),
        },
        { onConflict: "user_id,badge_key" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_badges", user?.id] });
      qc.invalidateQueries({ queryKey: ["user_stats", user?.id] });
    },
  });

  // Auto-unlock badges when criteria are met
  useEffect(() => {
    if (!user || catalog.length === 0) return;
    for (const badge of catalog) {
      const key = badge.badge_key;
      if (!unlockedKeys.has(key) && !unlockingRef.current.has(key)) {
        const progress = computeBadgeProgress(badge, stats);
        if (progress >= 100) {
          unlockingRef.current.add(key);
          unlockMutation.mutate(badge);
        }
      }
    }
  }, [catalog, stats, unlockedKeys, user]); // eslint-disable-line react-hooks/exhaustive-deps

  return { badgesWithProgress, isLoading, stats };
}
