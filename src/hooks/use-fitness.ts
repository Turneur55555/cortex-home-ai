import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// ---------- Nutrition goals ----------
export type NutritionGoals = {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
};

export function useNutritionGoals() {
  return useQuery({
    queryKey: ["nutrition_goals"],
    queryFn: async (): Promise<NutritionGoals | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("nutrition_goals")
        .select("calories, proteins, carbs, fats")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

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

// ---------- Body tracking ----------
export function useBodyMeasurements() {
  return useQuery({
    queryKey: ["body_tracking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("*")
        .or(
          "weight.not.is.null,body_fat.not.is.null,muscle_mass.not.is.null,chest.not.is.null,waist.not.is.null,hips.not.is.null,left_arm.not.is.null,right_arm.not.is.null,left_thigh.not.is.null,right_thigh.not.is.null,notes.not.is.null",
        )
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("body_tracking").insert({ ...input, user_id: user.id });
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("body_tracking")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
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
      exercises: Array<{
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
        image_path?: string | null;
      }>;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
            image_path: e.image_path ?? null,
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.from("exercises").delete().eq("workout_id", id).eq("user_id", user.id);
      const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("nutrition").insert({ ...input, user_id: user.id });
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      date,
    }: {
      id: string;
      patch: TablesUpdate<"nutrition">;
      date: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Workout / exercise mutations ----------
export function useUpdateWorkoutName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("workouts")
        .update({ name })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nom modifié");
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      name?: string;
      image_path?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercises")
        .update(fields)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercises")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice supprimé");
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddExerciseToWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workoutId,
      exercise,
    }: {
      workoutId: string;
      exercise: {
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
      };
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("exercises").insert({
        user_id: user.id,
        workout_id: workoutId,
        name: exercise.name,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        weight: exercise.weight ?? null,
        image_path: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice ajouté");
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Exercise images ----------
export function useExerciseImageUrls(paths: Array<string | null | undefined>) {
  const key = paths.filter(Boolean).sort().join("|");
  return useQuery({
    queryKey: ["exercise-image-urls", key],
    enabled: key.length > 0,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
      const map = new Map<string, string>();
      const { data, error } = await supabase.storage
        .from("exercise-images")
        .createSignedUrls(unique, 60 * 60);
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
      }
      return map;
    },
  });
}
