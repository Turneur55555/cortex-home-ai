import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

// ---------- Body tracking ----------
export function useBodyMeasurements() {
  return useQuery({
    queryKey: ["body_tracking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("*")
        .or("weight.not.is.null,body_fat.not.is.null,muscle_mass.not.is.null,chest.not.is.null,waist.not.is.null,hips.not.is.null,left_arm.not.is.null,right_arm.not.is.null,left_thigh.not.is.null,right_thigh.not.is.null,notes.not.is.null")
        .order("date", { ascending: false })
        .limit(180);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBodyMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"body_tracking">, "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("body_tracking")
        .insert({ ...input, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mesure ajoutée");
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBodyMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("body_tracking").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimée");
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Workouts ----------
export function useWorkouts() {
  return useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*, exercises(*)")
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      date: string;
      duration_minutes?: number | null;
      notes?: string | null;
      exercises: Array<{ name: string; sets?: number | null; reps?: number | null; weight?: number | null }>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data: workout, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          name: input.name,
          date: input.date,
          duration_minutes: input.duration_minutes ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      if (input.exercises.length > 0) {
        const { error: exErr } = await supabase.from("exercises").insert(
          input.exercises.map((e) => ({
            user_id: user.id,
            workout_id: workout.id,
            name: e.name,
            sets: e.sets ?? null,
            reps: e.reps ?? null,
            weight: e.weight ?? null,
          })),
        );
        if (exErr) throw exErr;
      }
    },
    onSuccess: () => {
      toast.success("Séance enregistrée");
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.from("exercises").delete().eq("workout_id", id).eq("user_id", user.id);
      const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance supprimée");
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Nutrition ----------
export function useNutrition(date: string) {
  return useQuery({
    queryKey: ["nutrition", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition")
        .select("*")
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"nutrition">, "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .insert({ ...input, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Repas ajouté");
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("nutrition").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
