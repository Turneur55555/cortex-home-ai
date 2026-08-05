import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import type {
  CalorieStrategyGoal,
  FatLossRate,
  MuscleGainRate,
} from "@/lib/fitness/calorieStrategy";
import { isKnownBodyFatMethod, type BodyFatMethod } from "@/lib/fitness/bodyComposition";

export interface PhysicalGoal {
  id: string;
  goal: CalorieStrategyGoal;
  targetRate: FatLossRate | MuscleGainRate | null;
  startedAt: string;
  startingWeightKg: number | null;
  startingBodyFatPercent: number | null;
  startingBodyFatMethod: BodyFatMethod | null;
  startingLeanMassKg: number | null;
  targetWeightKg: number | null;
  targetBodyFatPercent: number | null;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  completedAt: string | null;
}

function isCalorieStrategyGoal(value: unknown): value is CalorieStrategyGoal {
  return value === "fat_loss" || value === "maintenance" || value === "muscle_gain";
}

function isTargetRate(value: unknown): value is FatLossRate | MuscleGainRate {
  return value === "slow" || value === "moderate" || value === "fast";
}

function isPhysicalGoalStatus(value: unknown): value is PhysicalGoal["status"] {
  return value === "active" || value === "completed" || value === "cancelled";
}

const SELECT_COLUMNS =
  "id, goal, target_rate, started_at, starting_weight_kg, starting_body_fat_percent, starting_body_fat_method, starting_lean_mass_kg, target_weight_kg, target_body_fat_percent, status, created_at, completed_at";

function mapRow(data: {
  id: string;
  goal: string;
  target_rate: string | null;
  started_at: string;
  starting_weight_kg: number | null;
  starting_body_fat_percent: number | null;
  starting_body_fat_method: string | null;
  starting_lean_mass_kg: number | null;
  target_weight_kg: number | null;
  target_body_fat_percent: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}): PhysicalGoal {
  return {
    id: data.id,
    goal: isCalorieStrategyGoal(data.goal) ? data.goal : "maintenance",
    targetRate: isTargetRate(data.target_rate) ? data.target_rate : null,
    startedAt: data.started_at,
    startingWeightKg: data.starting_weight_kg,
    startingBodyFatPercent: data.starting_body_fat_percent,
    startingBodyFatMethod: isKnownBodyFatMethod(data.starting_body_fat_method)
      ? data.starting_body_fat_method
      : null,
    startingLeanMassKg: data.starting_lean_mass_kg,
    targetWeightKg: data.target_weight_kg,
    targetBodyFatPercent: data.target_body_fat_percent,
    status: isPhysicalGoalStatus(data.status) ? data.status : "active",
    createdAt: data.created_at,
    completedAt: data.completed_at,
  };
}

/** Objectif physique ACTIF de l'utilisateur — au plus un à la fois (contrainte DB, migration 20260814090000). */
export function usePhysicalGoal() {
  return useQuery({
    queryKey: ["physical_goals", "active"],
    staleTime: 60_000,
    queryFn: async (): Promise<PhysicalGoal | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await db
        .from("physical_goals")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : null;
    },
  });
}

/** Historique (objectifs terminés/annulés) — pas de grosse UI dédiée (§46 du brief), utilisé pour un affichage compact si besoin. */
export function usePhysicalGoalHistory() {
  return useQuery({
    queryKey: ["physical_goals", "history"],
    staleTime: 60_000,
    queryFn: async (): Promise<PhysicalGoal[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await db
        .from("physical_goals")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .neq("status", "active")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export interface CreatePhysicalGoalInput {
  goal: CalorieStrategyGoal;
  targetRate: FatLossRate | MuscleGainRate | null;
  startedAt: string;
  startingWeightKg: number | null;
  startingBodyFatPercent: number | null;
  startingBodyFatMethod: BodyFatMethod | null;
  startingLeanMassKg: number | null;
  targetWeightKg: number | null;
  targetBodyFatPercent: number | null;
}

/**
 * Crée un nouvel objectif ACTIF avec un snapshot de départ figé (§17 du
 * brief — jamais recalculé ensuite). Si un objectif actif existe déjà, il
 * est d'abord clôturé en `cancelled` (§21 : changer d'objectif clôture
 * l'ancien plutôt que de réécrire son historique) — deux écritures
 * séquentielles, non transactionnelles : en cas d'échec entre les deux,
 * l'état récupérable est "aucun objectif actif" (jamais deux objectifs
 * actifs, la contrainte unique DB l'empêche de toute façon), jamais une
 * perte de données puisque l'ancien objectif reste en base, seulement son
 * statut à corriger manuellement dans ce cas rarissime.
 */
export function useCreatePhysicalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePhysicalGoalInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: existingActive, error: existingError } = await db
        .from("physical_goals")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingActive) {
        const { error: cancelError } = await db
          .from("physical_goals")
          .update({ status: "cancelled" })
          .eq("id", existingActive.id)
          .eq("user_id", user.id);
        if (cancelError) throw cancelError;
      }

      const { error } = await db.from("physical_goals").insert({
        user_id: user.id,
        goal: input.goal,
        target_rate: input.targetRate,
        started_at: input.startedAt,
        starting_weight_kg: input.startingWeightKg,
        starting_body_fat_percent: input.startingBodyFatPercent,
        starting_body_fat_method: input.startingBodyFatMethod,
        starting_lean_mass_kg: input.startingLeanMassKg,
        target_weight_kg: input.targetWeightKg,
        target_body_fat_percent: input.targetBodyFatPercent,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objectif physique enregistré");
      qc.invalidateQueries({ queryKey: ["physical_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Change uniquement le rythme de l'objectif actif — la trajectoire future est recalculée à la lecture (jamais persistée), l'historique n'est jamais réécrit (§45 du brief). */
export function useUpdatePhysicalGoalRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; targetRate: FatLossRate | MuscleGainRate | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("physical_goals")
        .update({ target_rate: input.targetRate })
        .eq("id", input.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rythme mis à jour");
      qc.invalidateQueries({ queryKey: ["physical_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule l'objectif actif — reste en base, historisé (§46). */
export function useCancelPhysicalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("physical_goals")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objectif annulé");
      qc.invalidateQueries({ queryKey: ["physical_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Marque l'objectif actif comme atteint — TOUJOURS une action utilisateur explicite (§43 : jamais automatique sur une seule pesée), même quand `isWeightGoalLikelyReached` le suggère. */
export function useCompletePhysicalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("physical_goals")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objectif marqué comme atteint");
      qc.invalidateQueries({ queryKey: ["physical_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
