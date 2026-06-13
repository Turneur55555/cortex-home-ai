import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
export interface ExerciseSet { id: string; exercise_id: string; user_id: string; set_number: number; reps: number | null; weight: number | null; rpe: number | null; notes: string | null; created_at: string; }
export interface ExerciseSetInput { reps: number | null; weight: number | null; rpe?: number | null; notes?: string | null; }
const db = supabase as any;
const keyFor = (exerciseId: string) => ["exercise_sets", exerciseId] as const;
export function useExerciseSets(exerciseId: string | null | undefined) {
  return useQuery({
    queryKey: keyFor(exerciseId ?? "none"), enabled: !!exerciseId,
    queryFn: async (): Promise<ExerciseSet[]> => {
      if (!exerciseId) return [];
      const { data, error } = await db.from("exercise_sets").select("*").eq("exercise_id", exerciseId).order("set_number", { ascending: true });
      if (error) throw error; return (data ?? []) as ExerciseSet[];
    },
  });
}
export function useReplaceExerciseSets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { exerciseId: string; sets: ExerciseSetInput[] }) => {
      const { exerciseId, sets } = params;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error: delError } = await db.from("exercise_sets").delete().eq("exercise_id", exerciseId);
      if (delError) throw delError;
      const rows = sets.map((s, i) => ({ exercise_id: exerciseId, user_id: user.id, set_number: i + 1, reps: s.reps, weight: s.weight, rpe: s.rpe ?? null, notes: s.notes ?? null }));
      if (rows.length > 0) { const { error: insError } = await db.from("exercise_sets").insert(rows); if (insError) throw insError; }
      return { exerciseId };
    },
    onSuccess: ({ exerciseId }: { exerciseId: string }) => { qc.invalidateQueries({ queryKey: keyFor(exerciseId) }); qc.invalidateQueries({ queryKey: ["workouts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useAddExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { exerciseId: string; set: ExerciseSetInput }) => {
      const { exerciseId, set } = params;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data: existing, error: maxError } = await db.from("exercise_sets").select("set_number").eq("exercise_id", exerciseId).order("set_number", { ascending: false }).limit(1);
      if (maxError) throw maxError;
      const nextNumber = existing && existing.length > 0 ? (existing[0].set_number as number) + 1 : 1;
      const { error } = await db.from("exercise_sets").insert({ exercise_id: exerciseId, user_id: user.id, set_number: nextNumber, reps: set.reps, weight: set.weight, rpe: set.rpe ?? null, notes: set.notes ?? null });
      if (error) throw error; return { exerciseId };
    },
    onSuccess: ({ exerciseId }: { exerciseId: string }) => { qc.invalidateQueries({ queryKey: keyFor(exerciseId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useDeleteExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; exerciseId: string }) => {
      const { error } = await db.from("exercise_sets").delete().eq("id", params.id);
      if (error) throw error; return params;
    },
    onSuccess: ({ exerciseId }: { exerciseId: string }) => { qc.invalidateQueries({ queryKey: keyFor(exerciseId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}
