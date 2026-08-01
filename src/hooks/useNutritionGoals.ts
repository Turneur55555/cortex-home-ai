import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  CalorieStrategyGoal,
  CalorieStrategyMode,
  FatLossRate,
  MuscleGainRate,
} from "@/lib/fitness/calorieStrategy";

export type NutritionGoals = {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
};

function isCalorieStrategyGoal(value: unknown): value is CalorieStrategyGoal {
  return value === "fat_loss" || value === "maintenance" || value === "muscle_gain";
}

function isTargetRate(value: unknown): value is FatLossRate | MuscleGainRate {
  return value === "slow" || value === "moderate" || value === "fast";
}

/**
 * Objectifs nutritionnels actifs + préférence de stratégie calorique
 * (Phase 4B — `nutrition_goals.goal/target_rate/calorie_strategy_mode/
 * last_auto_adjustment_at`, migration 20260807090000). `goal`/`targetRate`
 * décrivent une catégorie métier stable (jamais un coefficient) — même
 * principe que `metabolic_profile.activity_level`.
 */
export interface NutritionGoalsWithStrategy extends NutritionGoals {
  goal: CalorieStrategyGoal | null;
  targetRate: FatLossRate | MuscleGainRate | null;
  /** `manual` par défaut — jamais activé automatiquement hors action explicite de l'utilisateur. */
  calorieStrategyMode: CalorieStrategyMode;
  /** Horodatage du dernier ajustement AUTOMATIQUE uniquement (jamais un `manual_apply`) — base du cooldown. */
  lastAutoAdjustmentAt: string | null;
}

export function useNutritionGoals() {
  return useQuery({
    queryKey: ["nutrition_goals"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NutritionGoalsWithStrategy | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("nutrition_goals")
        .select(
          "calories, proteins, carbs, fats, goal, target_rate, calorie_strategy_mode, last_auto_adjustment_at",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        calories: data.calories,
        proteins: data.proteins,
        carbs: data.carbs,
        fats: data.fats,
        goal: isCalorieStrategyGoal(data.goal) ? data.goal : null,
        targetRate: isTargetRate(data.target_rate) ? data.target_rate : null,
        calorieStrategyMode: data.calorie_strategy_mode === "automatic" ? "automatic" : "manual",
        lastAutoAdjustmentAt: data.last_auto_adjustment_at,
      };
    },
  });
}

/** Édition MANUELLE des calories/macros (GoalsSheet) — ne touche jamais goal/target_rate/calorie_strategy_mode. */
export function useUpsertNutritionGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NutritionGoals) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition_goals")
        .upsert({ user_id: user.id, ...input }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objectifs enregistrés");
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Bascule manual/automatic (+ objectif/rythme choisis) — sauvegarde
 * uniquement la PRÉFÉRENCE, n'applique aucune calorie (§34 : sauvegarder le
 * mode d'abord, évaluer/appliquer ensuite comme une étape séparée).
 */
export function useUpdateCalorieStrategyPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mode: CalorieStrategyMode;
      goal?: CalorieStrategyGoal | null;
      targetRate?: FatLossRate | MuscleGainRate | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("nutrition_goals").upsert(
        {
          user_id: user.id,
          calorie_strategy_mode: input.mode,
          ...(input.goal !== undefined ? { goal: input.goal } : {}),
          ...(input.targetRate !== undefined ? { target_rate: input.targetRate } : {}),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Applique une calorie cible (manuelle validée ou automatique) via la RPC
 * transactionnelle `apply_calorie_goal_adjustment` — met à jour
 * `nutrition_goals.calories` ET insère l'historique en une seule opération
 * (jamais directement via un upsert client, voir migration 20260807090000).
 * Ne touche jamais proteins/carbs/fats.
 */
export function useApplyCalorieGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mode: "manual_apply" | "automatic";
      appliedCalories: number;
      recommendedCalories?: number | null;
      goal?: CalorieStrategyGoal | null;
      targetRate?: (FatLossRate | MuscleGainRate) | null;
      referenceTdeeKcal?: number | null;
      referenceSource?: "adaptive" | "modeled" | null;
      reason?: string | null;
    }) => {
      const { error } = await supabase.rpc("apply_calorie_goal_adjustment", {
        _mode: input.mode,
        _applied_calories: Math.round(input.appliedCalories),
        _recommended_calories:
          input.recommendedCalories != null ? Math.round(input.recommendedCalories) : undefined,
        _goal: input.goal ?? undefined,
        _target_rate: input.targetRate ?? undefined,
        _reference_tdee_kcal:
          input.referenceTdeeKcal != null ? Math.round(input.referenceTdeeKcal) : undefined,
        _reference_source: input.referenceSource ?? undefined,
        _reason: input.reason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.mode === "manual_apply") {
        toast.success("Objectif calorique mis à jour");
      }
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
      qc.invalidateQueries({ queryKey: ["calorie_goal_adjustments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface CalorieGoalAdjustmentEntry {
  createdAt: string;
  mode: "manual_apply" | "automatic";
  previousCalories: number | null;
  appliedCalories: number;
}

/** Dernier ajustement appliqué (manuel ou automatique) — pour l'affichage compact "Dernier ajustement". */
export function useLastCalorieGoalAdjustment() {
  return useQuery({
    queryKey: ["calorie_goal_adjustments"],
    staleTime: 60_000,
    queryFn: async (): Promise<CalorieGoalAdjustmentEntry | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("calorie_goal_adjustments")
        .select("created_at, mode, previous_calories, applied_calories")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        createdAt: data.created_at,
        mode: data.mode === "automatic" ? "automatic" : "manual_apply",
        previousCalories: data.previous_calories,
        appliedCalories: data.applied_calories,
      };
    },
  });
}
