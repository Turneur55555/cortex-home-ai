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
      gym_location?: string;
      exercises: Array<{
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
        image_path?: string | null;
        // Séries détaillées optionnelles (set-by-set + RPE).
        setDetails?: Array<{
          reps: number | null;
          weight: number | null;
          rpe?: number | null;
        }> | null;
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
          gym_location: input.gym_location ?? "Salle inconnue",
        } as unknown as TablesInsert<"workouts">)
        .select()
        .single();
      if (error) throw error;
      if (input.exercises.length > 0) {
        const { data: insertedExercises, error: exErr } = await supabase
          .from("exercises")
          .insert(
            input.exercises.map((e) => {
              const valid = (e.setDetails ?? []).filter(
                (d) => d.reps != null && d.weight != null && d.reps > 0 && d.weight > 0,
              );
              // Si des séries détaillées existent, on en dérive le résumé stocké
              // sur la ligne `exercises` (rétro-compat WorkoutCard / tonnage).
              const top = valid.reduce<{ reps: number; weight: number } | null>(
                (best, d) =>
                  best == null ||
                  (d.weight as number) > best.weight ||
                  ((d.weight as number) === best.weight && (d.reps as number) > best.reps)
                    ? { reps: d.reps as number, weight: d.weight as number }
                    : best,
                null,
              );
              return {
                user_id: user.id,
                workout_id: workout.id,
                name: e.name,
                sets: valid.length > 0 ? valid.length : (e.sets ?? null),
                reps: top ? top.reps : (e.reps ?? null),
                weight: top ? top.weight : (e.weight ?? null),
                image_path: e.image_path ?? null,
              };
            }),
          )
          .select("id");
        if (exErr) throw exErr;

        // Insertion des séries détaillées (set-by-set + RPE) pour les exercices
        // qui en fournissent. L'ordre renvoyé suit l'ordre d'insertion.
        if (insertedExercises) {
          const setRows = input.exercises.flatMap((e, i) => {
            const exerciseId = insertedExercises[i]?.id;
            if (!exerciseId) return [];
            const valid = (e.setDetails ?? []).filter(
              (d) => d.reps != null && d.weight != null && d.reps > 0 && d.weight > 0,
            );
            return valid.map((d, j) => ({
              exercise_id: exerciseId,
              user_id: user.id,
              set_number: j + 1,
              reps: d.reps,
              weight: d.weight,
              rpe: d.rpe ?? null,
            }));
          });
          if (setRows.length > 0) {
            const { error: setErr } = await supabase
              .from("exercise_sets")
              .insert(setRows);
            if (setErr) throw setErr;
          }
        }
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

// Type alias pour le cache `workouts` (incluant les exercices imbriqués).
type WorkoutsCache = Array<{
  id: string;
  exercises?: Array<{
    id: string;
    workout_id: string;
    user_id: string;
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    image_path: string | null;
  }> | null;
  [k: string]: unknown;
}>;

const WORKOUTS_KEY = ["workouts"] as const;
const ACTIVE_KEY = ["active_workout"] as const;

function patchWorkoutsCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (rows: WorkoutsCache) => WorkoutsCache,
) {
  const prev = qc.getQueryData<WorkoutsCache>(WORKOUTS_KEY);
  if (!prev) return prev;
  qc.setQueryData<WorkoutsCache>(WORKOUTS_KEY, updater(prev));
  return prev;
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
      sets?: number | null;
      reps?: number | null;
      weight?: number | null;
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
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) => ({
          ...w,
          exercises: (w.exercises ?? []).map((ex) =>
            ex.id === id ? { ...ex, ...fields } : ex,
          ),
        })),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
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
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) => ({
          ...w,
          exercises: (w.exercises ?? []).filter((ex) => ex.id !== id),
        })),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Exercice supprimé"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
  });
}

// Suppression batchée : une seule requête + une seule invalidation.
export function useDeleteExercises() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("exercises")
        .delete()
        .in("id", ids)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const set = new Set(ids);
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) => ({
          ...w,
          exercises: (w.exercises ?? []).filter((ex) => !set.has(ex.id)),
        })),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Exercice supprimé"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
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
    onMutate: async ({ workoutId, exercise }) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                exercises: [
                  ...(w.exercises ?? []),
                  {
                    id: tempId,
                    workout_id: workoutId,
                    user_id: "optimistic",
                    name: exercise.name,
                    sets: exercise.sets ?? null,
                    reps: exercise.reps ?? null,
                    weight: exercise.weight ?? null,
                    image_path: null,
                  },
                ],
              }
            : w,
        ),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Exercice ajouté"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
  });
}

// ---------- Active Workout types ----------
export type ActiveSet = {
  id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
};

export type ActiveExercise = {
  id: string;
  name: string;
  image_path: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  exercise_sets: ActiveSet[];
};

export type ActiveWorkout = {
  id: string;
  name: string;
  gym_location: string;
  created_at: string;
  exercises: ActiveExercise[];
};

// ---------- Active Workout hooks ----------

/** Retourne la séance commencée aujourd'hui non encore terminée, ou null. */
export function useActiveWorkout() {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: async (): Promise<ActiveWorkout | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      // Fenêtre glissante de 24h pour couvrir les séances tardives
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("workouts")
        .select(
          "id, name, gym_location, created_at, exercises(id, name, image_path, sets, reps, weight, exercise_sets(id, set_number, reps, weight, rpe))",
        )
        .eq("user_id", user.id)
        .is("duration_minutes", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = data as any;
      return {
        id: raw.id,
        name: raw.name,
        gym_location: raw.gym_location,
        created_at: raw.created_at,
        exercises: (raw.exercises ?? []).map((ex: any) => ({
          id: ex.id,
          name: ex.name,
          image_path: ex.image_path ?? null,
          sets: ex.sets ?? null,
          reps: ex.reps ?? null,
          weight: ex.weight ?? null,
          exercise_sets: (ex.exercise_sets ?? []).map((s: any) => ({
            id: s.id,
            set_number: s.set_number,
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            rpe: s.rpe ?? null,
          })),
        })),
      };
    },
  });
}

/** Crée une nouvelle séance active (sans duration_minutes = non terminée). */
export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      gym_location,
    }: {
      name: string;
      gym_location: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("workouts").insert({
        user_id: user.id,
        name,
        date: today,
        gym_location,
        // duration_minutes omis → null → séance "active"
      } as unknown as TablesInsert<"workouts">);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Termine la séance active : calcule la durée et la sauvegarde. */
export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workout: ActiveWorkout) => {
      const durationMs = Date.now() - new Date(workout.created_at).getTime();
      const durationMin = Math.max(1, Math.round(durationMs / 60_000));
      const { error } = await supabase
        .from("workouts")
        .update({ duration_minutes: durationMin })
        .eq("id", workout.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance terminée 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active et tout son contenu. */
export function useCancelWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      // Récupère les exercices pour supprimer leurs séries
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id")
        .eq("workout_id", workoutId);

      if (exercises && exercises.length > 0) {
        const ids = exercises.map((e) => e.id);
        await supabase.from("exercise_sets").delete().in("exercise_id", ids);
        await supabase.from("exercises").delete().in("id", ids);
      }

      const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance annulée");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Ajoute un exercice (vide) à la séance active. */
export function useAddExerciseToActiveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workoutId,
      name,
    }: {
      workoutId: string;
      name: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("exercises").insert({
        user_id: user.id,
        workout_id: workoutId,
        name,
        sets: null,
        reps: null,
        weight: null,
        image_path: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Exercise set mutations ----------

/** Ajoute une série à un exercice de la séance active. */
export function useAddExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      exerciseId,
      setNumber,
      reps,
      weight,
    }: {
      exerciseId: string;
      setNumber: number;
      reps: number | null;
      weight: number | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("exercise_sets").insert({
        user_id: user.id,
        exercise_id: exerciseId,
        set_number: setNumber,
        reps,
        weight,
        rpe: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Met à jour reps / weight / rpe d'une série. */
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
    }) => {
      const { error } = await supabase
        .from("exercise_sets")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Supprime une série par son id. */
export function useDeleteExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exercise_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
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
