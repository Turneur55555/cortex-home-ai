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
  /**
   * Préférence macros — Phase 5B, migration 20260808090000. INDÉPENDANTE de
   * `calorieStrategyMode` (§2 du brief Phase 5B) : les quatre combinaisons
   * calories/macros manuel/automatique sont toutes valides. `manual` par
   * défaut, jamais activé automatiquement.
   */
  macroStrategyMode: CalorieStrategyMode;
  /** Un verrou actif fige la macro correspondante à sa valeur ACTIVE ci-dessus (`proteins`/`carbs`/`fats`) — voir `lib/fitness/macroStrategy.ts`. */
  proteinLocked: boolean;
  carbsLocked: boolean;
  fatLocked: boolean;
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
          "calories, proteins, carbs, fats, goal, target_rate, calorie_strategy_mode, last_auto_adjustment_at, macro_strategy_mode, protein_locked, carbs_locked, fat_locked",
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
        macroStrategyMode: data.macro_strategy_mode === "automatic" ? "automatic" : "manual",
        proteinLocked: data.protein_locked === true,
        carbsLocked: data.carbs_locked === true,
        fatLocked: data.fat_locked === true,
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
 *
 * Les champs `macro*` (Phase 5B, migration 20260808090000) sont
 * OPTIONNELS : à ne fournir QUE lorsque Calories automatique ET Macros
 * automatique se déclenchent ensemble dans le même geste (§22 du brief
 * Phase 5B) — la RPC met alors AUSSI à jour proteins/carbs/fats et
 * journalise `macro_goal_adjustments` dans la MÊME transaction, évitant
 * l'état durable "calories mises à jour, macros encore alignées sur
 * l'ancien objectif". Pour un ajustement macros SEUL (manuel ou
 * automatique sans changement de calories), utiliser `useApplyMacroGoal`
 * ci-dessous à la place.
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
      macroMode?: "manual_apply" | "automatic" | null;
      appliedProteins?: number | null;
      appliedCarbs?: number | null;
      appliedFats?: number | null;
      recommendedProteins?: number | null;
      recommendedCarbs?: number | null;
      recommendedFats?: number | null;
      proteinLocked?: boolean | null;
      carbsLocked?: boolean | null;
      fatLocked?: boolean | null;
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
        _macro_mode: input.macroMode ?? undefined,
        _applied_proteins:
          input.appliedProteins != null ? Math.round(input.appliedProteins) : undefined,
        _applied_carbs: input.appliedCarbs != null ? Math.round(input.appliedCarbs) : undefined,
        _applied_fats: input.appliedFats != null ? Math.round(input.appliedFats) : undefined,
        _recommended_proteins:
          input.recommendedProteins != null ? Math.round(input.recommendedProteins) : undefined,
        _recommended_carbs:
          input.recommendedCarbs != null ? Math.round(input.recommendedCarbs) : undefined,
        _recommended_fats:
          input.recommendedFats != null ? Math.round(input.recommendedFats) : undefined,
        _protein_locked: input.proteinLocked ?? undefined,
        _carbs_locked: input.carbsLocked ?? undefined,
        _fat_locked: input.fatLocked ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.mode === "manual_apply") {
        toast.success("Objectif calorique mis à jour");
      }
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
      qc.invalidateQueries({ queryKey: ["calorie_goal_adjustments"] });
      if (vars.appliedProteins != null) {
        qc.invalidateQueries({ queryKey: ["macro_goal_adjustments"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Bascule manual/automatic + verrous individuels (Phase 5B) — sauvegarde
 * uniquement la PRÉFÉRENCE (même principe que
 * `useUpdateCalorieStrategyPreference`, indépendant de celle-ci). Un
 * verrou active fige la macro sur sa valeur ACTIVE courante — cette
 * mutation ne duplique jamais cette valeur, elle bascule seulement le
 * booléen (voir `lib/fitness/macroStrategy.ts` + migration 20260808090000).
 */
export function useUpdateMacroStrategyPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mode?: CalorieStrategyMode;
      proteinLocked?: boolean;
      carbsLocked?: boolean;
      fatLocked?: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("nutrition_goals").upsert(
        {
          user_id: user.id,
          ...(input.mode !== undefined ? { macro_strategy_mode: input.mode } : {}),
          ...(input.proteinLocked !== undefined ? { protein_locked: input.proteinLocked } : {}),
          ...(input.carbsLocked !== undefined ? { carbs_locked: input.carbsLocked } : {}),
          ...(input.fatLocked !== undefined ? { fat_locked: input.fatLocked } : {}),
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
 * Applique des macros (manuelle validée ou automatique) via la RPC
 * transactionnelle `apply_macro_goal_adjustment` — met à jour
 * `nutrition_goals.proteins/carbs/fats` ET insère l'historique en une seule
 * opération. Ne touche JAMAIS `calories` (voir migration 20260808090000).
 * Pour le cas où Calories automatique ET Macros automatique se déclenchent
 * ensemble, voir `useApplyCalorieGoal` (chemin atomique combiné) à la
 * place de cette mutation.
 */
export function useApplyMacroGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mode: "manual_apply" | "automatic";
      appliedProteins: number;
      appliedCarbs: number;
      appliedFats: number;
      recommendedProteins?: number | null;
      recommendedCarbs?: number | null;
      recommendedFats?: number | null;
      calorieTarget?: number | null;
      goal?: CalorieStrategyGoal | null;
      proteinLocked?: boolean | null;
      carbsLocked?: boolean | null;
      fatLocked?: boolean | null;
    }) => {
      const { error } = await supabase.rpc("apply_macro_goal_adjustment", {
        _mode: input.mode,
        _applied_proteins: Math.round(input.appliedProteins),
        _applied_carbs: Math.round(input.appliedCarbs),
        _applied_fats: Math.round(input.appliedFats),
        _recommended_proteins:
          input.recommendedProteins != null ? Math.round(input.recommendedProteins) : undefined,
        _recommended_carbs:
          input.recommendedCarbs != null ? Math.round(input.recommendedCarbs) : undefined,
        _recommended_fats:
          input.recommendedFats != null ? Math.round(input.recommendedFats) : undefined,
        _calorie_target: input.calorieTarget != null ? Math.round(input.calorieTarget) : undefined,
        _goal: input.goal ?? undefined,
        _protein_locked: input.proteinLocked ?? undefined,
        _carbs_locked: input.carbsLocked ?? undefined,
        _fat_locked: input.fatLocked ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.mode === "manual_apply") {
        toast.success("Macros mises à jour");
      }
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
      qc.invalidateQueries({ queryKey: ["macro_goal_adjustments"] });
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

export interface MacroGoalAdjustmentEntry {
  createdAt: string;
  mode: "manual_apply" | "automatic";
  previousProteins: number | null;
  previousCarbs: number | null;
  previousFats: number | null;
  appliedProteins: number;
  appliedCarbs: number;
  appliedFats: number;
}

/** Dernier ajustement de macros appliqué (manuel ou automatique) — affichage compact "Dernier ajustement macros" (§37 du brief Phase 5B). */
export function useLastMacroGoalAdjustment() {
  return useQuery({
    queryKey: ["macro_goal_adjustments"],
    staleTime: 60_000,
    queryFn: async (): Promise<MacroGoalAdjustmentEntry | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("macro_goal_adjustments")
        .select(
          "created_at, mode, previous_proteins, previous_carbs, previous_fats, applied_proteins, applied_carbs, applied_fats",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        createdAt: data.created_at,
        mode: data.mode === "automatic" ? "automatic" : "manual_apply",
        previousProteins: data.previous_proteins,
        previousCarbs: data.previous_carbs,
        previousFats: data.previous_fats,
        appliedProteins: data.applied_proteins,
        appliedCarbs: data.applied_carbs,
        appliedFats: data.applied_fats,
      };
    },
  });
}
