import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/db";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import type {
  CalorieStrategyGoal,
  FatLossRate,
  MuscleGainRate,
} from "@/lib/fitness/calorieStrategy";
import { isKnownBodyFatMethod, type BodyFatMethod } from "@/lib/fitness/bodyComposition";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";

/**
 * Offline-first (cf. src/lib/offline/) — table `physical_goals`, même pattern
 * que `useRecipes.ts`/`usePhysicalGoal.ts` d'origine : écriture toujours
 * locale (IndexedDB) d'abord, mise en queue de sync, lecture avec
 * hydratation en ligne + fallback local hors connexion. La contrainte "au
 * plus un objectif actif" (migration 20260814090000) est respectée
 * localement : `useCreatePhysicalGoal` clôture d'abord tout objectif actif
 * trouvé dans le store local avant de créer le nouveau, sans appel réseau.
 */

export interface PhysicalGoalRow {
  id: string;
  user_id: string;
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
  updated_at: string;
  completed_at: string | null;
}

export const physicalGoalsRepo = createOfflineRepository<PhysicalGoalRow>("physical_goals");

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

function mapRow(data: PhysicalGoalRow): PhysicalGoal {
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

async function refreshFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  try {
    const { data, error } = await db.from("physical_goals").select("*").eq("user_id", userId);
    if (!error && data) {
      await hydrateEntitiesFromServer("physical_goals", userId, data as PhysicalGoalRow[]);
    }
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

/** Objectif physique ACTIF de l'utilisateur — au plus un à la fois (contrainte DB, migration 20260814090000). */
export function usePhysicalGoal() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: ["physical_goals", "active", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PhysicalGoal | null> => {
      if (!userId) return null;
      await refreshFromServer(userId);
      const local = await physicalGoalsRepo.list(userId);
      const active = local.find((g) => g.status === "active");
      return active ? mapRow(active) : null;
    },
  });
}

/** Historique (objectifs terminés/annulés) — pas de grosse UI dédiée (§46 du brief), utilisé pour un affichage compact si besoin. */
export function usePhysicalGoalHistory() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: ["physical_goals", "history", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PhysicalGoal[]> => {
      if (!userId) return [];
      await refreshFromServer(userId);
      const local = await physicalGoalsRepo.list(userId);
      return local
        .filter((g) => g.status !== "active")
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 20)
        .map(mapRow);
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
 * l'ancien plutôt que de réécrire son historique) — deux écritures locales
 * séquentielles (toujours locales d'abord, cf. offline-first) : en cas de
 * coupure entre les deux, l'état récupérable est "aucun objectif actif"
 * (jamais deux objectifs actifs localement, on ne crée le nouveau qu'après
 * avoir clos l'ancien), jamais une perte de données puisque l'ancien
 * objectif reste dans le store local avec son statut mis à jour.
 */
export function useCreatePhysicalGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreatePhysicalGoalInput) => {
      if (!user) throw new Error("Non authentifié");
      const local = await physicalGoalsRepo.list(user.id);
      const existingActive = local.find((g) => g.status === "active");
      if (existingActive) {
        await physicalGoalsRepo.update(existingActive.id, user.id, { status: "cancelled" });
      }
      await physicalGoalsRepo.create(user.id, {
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
        completed_at: null,
      });
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; targetRate: FatLossRate | MuscleGainRate | null }) => {
      if (!user) throw new Error("Non authentifié");
      await physicalGoalsRepo.update(input.id, user.id, { target_rate: input.targetRate });
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await physicalGoalsRepo.update(id, user.id, { status: "cancelled" });
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await physicalGoalsRepo.update(id, user.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Objectif marqué comme atteint");
      qc.invalidateQueries({ queryKey: ["physical_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
