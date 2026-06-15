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

// ---------- Active workout (live session) ----------

export type ActiveSet = {
  id: string;
  exercise_id: string;
  user_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  tempo: string | null;
  rest_seconds: number | null;
  notes: string | null;
  created_at: string;
};

export type ActiveExercise = {
  id: string;
  workout_id: string;
  user_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  image_path: string | null;
  notes: string | null;
  exercise_sets: ActiveSet[];
};

export type ActiveWorkout = {
  id: string;
  user_id: string;
  date: string;
  name: string;
  duration_minutes: number | null;
  notes: string | null;
  gym_location: string;
  created_at: string;
  status: string;
  exercises: ActiveExercise[];
};

const ACTIVE_KEY = ["active_workout"] as const;

export function useActiveWorkout() {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from("workouts")
        .select("*, exercises(*, exercise_sets(*))")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ActiveWorkout | null;
    },
  });
}

export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; gym_location: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await (supabase as any)
        .from("workouts")
        .insert({
          user_id: user.id,
          name: input.name,
          date: today,
          gym_location: input.gym_location,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      return data as ActiveWorkout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workout: ActiveWorkout) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Backfill exercises summary from exercise_sets
      for (const ex of workout.exercises ?? []) {
        const sets = (ex.exercise_sets ?? []).filter(
          (s) => s.reps != null && s.weight != null,
        );
        if (sets.length > 0) {
          const maxWeight = sets.reduce(
            (m, s) => (s.weight != null ? Math.max(m, s.weight) : m),
            0,
          );
          const bestSet = sets.find((s) => s.weight === maxWeight) ?? sets[0];
          await supabase
            .from("exercises")
            .update({ sets: sets.length, reps: bestSet.reps, weight: maxWeight > 0 ? maxWeight : null })
            .eq("id", ex.id)
            .eq("user_id", user.id);
        }
      }

      const { error } = await (supabase as any)
        .from("workouts")
        .update({ status: "completed" })
        .eq("id", workout.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance terminée 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.from("exercises").delete().eq("workout_id", id).eq("user_id", user.id);
      const { error } = await (supabase as any)
        .from("workouts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance annulée");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddExerciseToActiveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workoutId,
      name,
      imagePath,
    }: {
      workoutId: string;
      name: string;
      imagePath?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data, error } = await supabase
        .from("exercises")
        .insert({
          user_id: user.id,
          workout_id: workoutId,
          name,
          image_path: imagePath ?? null,
          sets: 0,
          reps: null,
          weight: null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      exerciseId,
      setNumber,
      reps,
      weight,
      rpe,
    }: {
      exerciseId: string;
      setNumber: number;
      reps?: number | null;
      weight?: number | null;
      rpe?: number | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data, error } = await supabase
        .from("exercise_sets")
        .insert({
          exercise_id: exerciseId,
          user_id: user.id,
          set_number: setNumber,
          reps: reps ?? null,
          weight: weight ?? null,
          rpe: rpe ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      reps?: number | null;
      weight?: number | null;
      rpe?: number | null;
      tempo?: string | null;
      rest_seconds?: number | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercise_sets")
        .update(fields)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercise_sets")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExercises() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercises")
        .delete()
        .in("id", ids)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice supprimé");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
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
