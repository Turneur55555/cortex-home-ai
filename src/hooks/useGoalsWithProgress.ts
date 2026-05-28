import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type GoalType = "workouts_weekly" | "protein_daily" | "weight_loss" | "custom";
export type GoalStatus = "active" | "almost" | "done" | "late";

export interface Goal {
  id: string;
  title: string;
  goal_type: GoalType;
  target_value: number | null;
  target_date: string;
  xp_reward: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface GoalWithProgress extends Goal {
  progress: number;
  status: GoalStatus;
  current_value: number;
  icon: string;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function computeStatus(progress: number, target_date: string, is_completed: boolean): GoalStatus {
  if (is_completed || progress >= 100) return "done";
  if (new Date(target_date) < new Date()) return "late";
  if (progress >= 75) return "almost";
  return "active";
}

function goalIcon(type: GoalType): string {
  const icons: Record<GoalType, string> = {
    workouts_weekly: "Dumbbell",
    protein_daily: "Apple",
    weight_loss: "TrendingDown",
    custom: "Star",
  };
  return icons[type];
}

// Internal data-fetching hooks

function useWeeklyWorkoutCount() {
  const { user } = useAuth();
  const weekStart = getWeekStart();
  return useQuery({
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
}

function useTodayProtein() {
  const { user } = useAuth();
  const today = getToday();
  return useQuery({
    queryKey: ["nutrition_protein_today", today],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition")
        .select("proteins")
        .eq("date", today);
      if (error) throw error;
      return data?.reduce((sum, row) => sum + (row.proteins ?? 0), 0) ?? 0;
    },
  });
}

function useProteinTarget() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["nutrition_goals_protein_target", user?.id],
    enabled: !!user,
    staleTime: 120_000,
    queryFn: async () => {
      if (!user) return 150;
      const { data } = await supabase
        .from("nutrition_goals")
        .select("proteins")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.proteins ?? 150;
    },
  });
}

function useBodyWeightHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["body_weight_history"],
    enabled: !!user,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("weight, date")
        .not("weight", "is", null)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { weight: number | null; date: string }[];
    },
  });
}

// Public goal CRUD

export function useGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["goals", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await (supabase as any)
        .from("goals")
        .select("id, title, goal_type, target_value, target_date, xp_reward, is_completed, completed_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });
}

export function useAddGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      goal_type: GoalType;
      target_value?: number | null;
      target_date: string;
      xp_reward?: number;
    }) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await (supabase as any)
        .from("goals")
        .insert({ ...input, user_id: user.id, xp_reward: input.xp_reward ?? 100 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", user?.id] }),
    onError: () => toast.error("Impossible de créer l'objectif"),
  });
}

export function useUpdateGoal() {
export function useUpdateGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      target_value?: number | null;
      target_date?: string;
    }) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await (supabase as any)
        .from("goals")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", user?.id] }),
    onError: () => toast.error("Impossible de modifier l'objectif"),
  });
}

export function useCompleteGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await (supabase as any)
        .from("goals")
        .update({ is_completed: done, completed_at: done ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals", user?.id] });
      qc.invalidateQueries({ queryKey: ["goals_completed_count", user?.id] });
    },
    onError: () => toast.error("Impossible de mettre à jour l'objectif"),
  });
}


export function useRemoveGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await (supabase as any)
        .from("goals")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", user?.id] }),
    onError: () => toast.error("Impossible de supprimer l'objectif"),
  });
}

// Combined hook: goals + auto-calculated progress

export function useGoalsWithProgress(): { goals: GoalWithProgress[]; isLoading: boolean } {
  const { data: goals, isLoading: goalsLoading } = useGoals();
  const { data: weeklyWorkouts = 0, isLoading: workoutsLoading } = useWeeklyWorkoutCount();
  const { data: todayProtein = 0, isLoading: proteinLoading } = useTodayProtein();
  const { data: proteinTarget = 150 } = useProteinTarget();
  const { data: bodyWeights = [], isLoading: weightsLoading } = useBodyWeightHistory();

  const isLoading = goalsLoading || workoutsLoading || proteinLoading || weightsLoading;

  const goalsWithProgress = useMemo((): GoalWithProgress[] => {
    if (!goals) return [];

    return goals.map((g) => {
      let progress = 0;
      let current_value = 0;

      if (g.is_completed) {
        progress = 100;
        current_value = g.target_value ?? 1;
      } else {
        switch (g.goal_type) {
          case "workouts_weekly": {
            const target = g.target_value ?? 3;
            current_value = weeklyWorkouts;
            progress = Math.min(100, Math.round((weeklyWorkouts / target) * 100));
            break;
          }
          case "protein_daily": {
            const target = g.target_value ?? proteinTarget ?? 150;
            current_value = Math.round(todayProtein);
            progress = Math.min(100, Math.round((todayProtein / target) * 100));
            break;
          }
          case "weight_loss": {
            if (bodyWeights.length >= 2 && g.target_value) {
              const start = bodyWeights[0].weight ?? 0;
              const current = bodyWeights[bodyWeights.length - 1].weight ?? 0;
              const lost = start - current;
              current_value = Math.round(lost * 10) / 10;
              progress = Math.min(100, Math.round((Math.max(0, lost) / g.target_value) * 100));
            }
            break;
          }
          case "custom":
          default:
            progress = 0;
            break;
        }
      }

      return {
        ...g,
        progress,
        current_value,
        status: computeStatus(progress, g.target_date, g.is_completed),
        icon: goalIcon(g.goal_type),
      };
    });
  }, [goals, weeklyWorkouts, todayProtein, proteinTarget, bodyWeights]);

  return { goals: goalsWithProgress, isLoading };
}
