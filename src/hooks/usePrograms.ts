import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateProgramWeeks,
  type GenerateProgramOptions,
  type PeriodizationModel,
  type ProgramGoal,
} from "@/lib/fitness/periodization";

/**
 * CRUD typé des programmes Coach IA V2 (react-query).
 * Tables : training_programs, program_weeks, program_sessions, program_exercises.
 * Le cast `supabase as any` suit le pattern useExerciseSets (types Supabase non
 * encore régénérés tant que types.ts n'inclut pas ces tables).
 */
const db = supabase as any;

export interface TrainingProgram {
  id: string;
  user_id: string;
  name: string;
  goal: ProgramGoal;
  periodization_model: PeriodizationModel;
  total_weeks: number;
  days_per_week: number | null;
  start_date: string | null;
  status: "draft" | "active" | "completed" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramWeek {
  id: string;
  program_id: string;
  user_id: string;
  week_number: number;
  phase: string;
  intensity_pct: number | null;
  target_rpe: number | null;
  volume_multiplier: number;
  is_deload: boolean;
  created_at: string;
}

const PROGRAMS_KEY = ["training_programs"] as const;
const weeksKey = (programId: string) => ["program_weeks", programId] as const;

export function usePrograms() {
  return useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: async (): Promise<TrainingProgram[]> => {
      const { data, error } = await db
        .from("training_programs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingProgram[];
    },
  });
}

export function useProgramWeeks(programId: string | null | undefined) {
  return useQuery({
    queryKey: weeksKey(programId ?? "none"),
    enabled: !!programId,
    queryFn: async (): Promise<ProgramWeek[]> => {
      if (!programId) return [];
      const { data, error } = await db
        .from("program_weeks")
        .select("*")
        .eq("program_id", programId)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgramWeek[];
    },
  });
}

export interface CreateProgramInput {
  name: string;
  goal: ProgramGoal;
  model: PeriodizationModel;
  totalWeeks: number;
  daysPerWeek?: number | null;
  startDate?: string | null;
  deloadEvery?: number;
  notes?: string | null;
}

/**
 * Crée un programme ET peuple automatiquement program_weeks via la périodisation
 * pure (generateProgramWeeks). Une seule mutation = programme prêt à l'emploi.
 */
export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProgramInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: program, error: progError } = await db
        .from("training_programs")
        .insert({
          user_id: user.id,
          name: input.name,
          goal: input.goal,
          periodization_model: input.model,
          total_weeks: input.totalWeeks,
          days_per_week: input.daysPerWeek ?? null,
          start_date: input.startDate ?? null,
          notes: input.notes ?? null,
          status: "draft",
        })
        .select("id")
        .single();
      if (progError) throw progError;

      const opts: GenerateProgramOptions = {
        goal: input.goal,
        model: input.model,
        totalWeeks: input.totalWeeks,
        deloadEvery: input.deloadEvery,
      };
      const weeks = generateProgramWeeks(opts).map((w) => ({
        program_id: program.id,
        user_id: user.id,
        week_number: w.weekNumber,
        phase: w.phase,
        intensity_pct: w.intensityPct,
        target_rpe: w.targetRpe,
        volume_multiplier: w.volumeMultiplier,
        is_deload: w.isDeload,
      }));
      if (weeks.length > 0) {
        const { error: weeksError } = await db.from("program_weeks").insert(weeks);
        if (weeksError) throw weeksError;
      }
      return { programId: program.id as string };
    },
    onSuccess: ({ programId }: { programId: string }) => {
      qc.invalidateQueries({ queryKey: PROGRAMS_KEY });
      qc.invalidateQueries({ queryKey: weeksKey(programId) });
      toast.success("Programme créé");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; patch: Partial<Omit<TrainingProgram, "id" | "user_id" | "created_at">> }) => {
      const { error } = await db
        .from("training_programs")
        .update({ ...params.patch, updated_at: new Date().toISOString() })
        .eq("id", params.id);
      if (error) throw error;
      return params;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Cascade DB supprime weeks/sessions/exercises.
      const { error } = await db.from("training_programs").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}
