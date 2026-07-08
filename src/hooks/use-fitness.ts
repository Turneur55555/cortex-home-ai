import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// ---------- Domaines extraits (re-exports pour rétro-compat) ----------
export type { NutritionGoals } from "./useNutritionGoals";
export { useNutritionGoals, useUpsertNutritionGoals } from "./useNutritionGoals";
export { useBodyMeasurements, useAddBodyMeasurement, useDeleteBodyMeasurement } from "./useBodyTracking";

// ---------- Workouts ----------
export function useWorkouts() {
  return useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select(
          "*, exercises(*, exercise_sets(id, set_number, reps, weight, completed, rest_seconds))",
        )
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
      // Fondation moteurs (phase 1) : discipline + metadata sont additifs,
      // par défaut 'muscu'/{} pour tout appelant existant. Réservé aux
      // futurs moteurs (HYROX, Course, Cardio...) qui n'écrivent jamais
      // dans exercises/exercise_sets — voir src/lib/fitness/engines/types.ts.
      discipline?: "muscu" | "hyrox" | "course" | "cardio" | "guided";
      metadata?: Record<string, unknown>;
      exercises: Array<{
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
        image_path?: string | null;
        // Séries détaillées optionnelles (set-by-set).
        setDetails?: Array<{
          reps: number | null;
          weight: number | null;
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
          discipline: input.discipline ?? "muscu",
          metadata: input.metadata ?? {},
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

        // Insertion des séries détaillées (set-by-set) pour les exercices
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
              completed: true,
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
      // Les exercices et leurs séries sont supprimés par cascade FK (ON DELETE CASCADE).
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

// ---------- Nutrition journalière (re-export) ----------
export {
  useNutrition,
  useAddNutrition,
  useAddNutritionBatch,
  useDeleteNutrition,
  useUpdateNutrition,
  useCopyNutritionDay,
} from "./useNutritionData";

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
    muscle_groups: string[] | null;
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
                    muscle_groups: null,
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
  completed: boolean;
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
      // C3 : la séance active est identifiée par status='active' (colonne dédiée),
      // plus par duration_minutes NULL — une saisie rétro sans durée ne bascule
      // donc plus l'UI en mode live.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("workouts")
        .select(
          "id, name, gym_location, created_at, exercises(id, name, image_path, sets, reps, weight, exercise_sets(id, set_number, reps, weight, completed))",
        )
        .eq("user_id", user.id)
        .eq("status", "active")
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
            completed: s.completed ?? false,
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
        status: "active",
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
      const durationMin = Math.min(600, Math.max(1, Math.round(durationMs / 60_000)));
      const { error } = await supabase
        .from("workouts")
        .update({ duration_minutes: durationMin, status: "completed" } as unknown as TablesUpdate<"workouts">)
        .eq("id", workout.id);
      if (error) throw error;

      // H2 : synchronise les colonnes résumé `exercises.sets/reps/weight` depuis
      // les séries réelles (validées en priorité) pour que « Exercices récents »
      // et « Refaire » affichent les dernières perfs des séances live.
      for (const ex of workout.exercises ?? []) {
        const filled = (ex.exercise_sets ?? []).filter(
          (st) => st.reps != null && st.weight != null && st.reps > 0 && st.weight > 0,
        );
        const done = filled.filter((st) => st.completed);
        const source = done.length > 0 ? done : filled;
        if (source.length === 0) continue;
        const top = source.reduce((best, st) =>
          (st.weight as number) > (best.weight as number) ||
          ((st.weight as number) === (best.weight as number) &&
            (st.reps as number) > (best.reps as number))
            ? st
            : best,
        );
        const { error: sumErr } = await supabase
          .from("exercises")
          .update({ sets: source.length, reps: top.reps, weight: top.weight })
          .eq("id", ex.id);
        if (sumErr) console.warn("[finishWorkout] sync résumé échoué", ex.name, sumErr.message);
      }
    },
    onSuccess: (_d, workout) => {
      toast.success("Séance terminée 💪");
      logActivity("workout", `Séance terminée : ${workout.name}`, { workout_id: workout.id });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active et tout son contenu. */
export function useCancelWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      // Exercices + séries supprimés par cascade FK (ON DELETE CASCADE).
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

/** Source pour « Refaire en live » : une séance passée avec ses exercices/séries. */
export type RepeatSourceWorkout = {
  name: string | null;
  gym_location?: string | null;
  exercises?: Array<{
    name: string;
    image_path?: string | null;
    sets?: number | null;
    reps?: number | null;
    weight?: number | null;
    exercise_sets?: Array<{
      set_number: number | null;
      reps: number | null;
      weight: number | null;
    }> | null;
  }> | null;
};

/**
 * H1 — « Refaire en live » : crée une séance ACTIVE pré-remplie depuis une
 * séance passée (exercices + séries copiées, non validées). Convention legacy
 * gérée : si un exercice n'a pas de séries détaillées, on dérive depuis les
 * colonnes résumé (weight NULL → `sets` = reps et `reps` = charge).
 */
export function useStartWorkoutFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: RepeatSourceWorkout) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Garde : une seule séance active à la fois.
      const { data: existing } = await (supabase as any)
        .from("workouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (existing) throw new Error("Une séance est déjà en cours.");

      const today = new Date().toISOString().split("T")[0];
      const { data: workout, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          name: source.name || "Séance",
          date: today,
          gym_location: source.gym_location ?? "Salle inconnue",
          status: "active",
        } as unknown as TablesInsert<"workouts">)
        .select("id")
        .single();
      if (error) throw error;

      // Déduplique les exercices par nom (les séances legacy ont 1 ligne/série).
      const groups = new Map<
        string,
        {
          name: string;
          image_path: string | null;
          setRows: Array<{ reps: number | null; weight: number | null }>;
        }
      >();
      for (const ex of source.exercises ?? []) {
        const key = ex.name.trim().toLowerCase();
        if (!key) continue;
        if (!groups.has(key)) {
          groups.set(key, { name: ex.name, image_path: ex.image_path ?? null, setRows: [] });
        }
        const g = groups.get(key)!;
        if (!g.image_path && ex.image_path) g.image_path = ex.image_path;
        const detailed = [...(ex.exercise_sets ?? [])].sort(
          (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0),
        );
        if (detailed.length > 0) {
          for (const d of detailed) g.setRows.push({ reps: d.reps, weight: d.weight });
        } else if (ex.weight != null) {
          // Résumé moderne : sets × (reps, weight)
          const n = Math.max(1, ex.sets ?? 1);
          for (let i = 0; i < n; i++) g.setRows.push({ reps: ex.reps ?? null, weight: ex.weight });
        } else if (ex.sets != null || ex.reps != null) {
          // Convention legacy : weight NULL → sets = reps, reps = charge.
          g.setRows.push({ reps: ex.sets ?? null, weight: ex.reps ?? null });
        }
      }

      const groupList = Array.from(groups.values());
      if (groupList.length > 0) {
        const { data: insertedExs, error: exErr } = await supabase
          .from("exercises")
          .insert(
            groupList.map((g) => ({
              user_id: user.id,
              workout_id: workout.id,
              name: g.name,
              sets: null,
              reps: null,
              weight: null,
              image_path: g.image_path,
            })),
          )
          .select("id");
        if (exErr) throw exErr;

        const setRows = groupList.flatMap((g, i) => {
          const exerciseId = insertedExs?.[i]?.id;
          if (!exerciseId) return [];
          return g.setRows.map((r, j) => ({
            exercise_id: exerciseId,
            user_id: user.id,
            set_number: j + 1,
            reps: r.reps,
            weight: r.weight,
            completed: false,
          }));
        });
        if (setRows.length > 0) {
          const { error: setErr } = await supabase.from("exercise_sets").insert(setRows);
          if (setErr) throw setErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Séance relancée — bonnes séries 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
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

/** Patch optimiste du cache de la séance active. Retourne l'état précédent. */
function patchActiveCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (w: ActiveWorkout) => ActiveWorkout,
) {
  const prev = qc.getQueryData<ActiveWorkout | null>(ACTIVE_KEY);
  if (!prev) return prev;
  qc.setQueryData<ActiveWorkout | null>(ACTIVE_KEY, updater(prev));
  return prev;
}

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

      // Défense en profondeur : si `setNumber` entre en conflit malgré tout
      // (course entre onglets/appareils), on relit le max côté serveur et on
      // retente une fois au lieu de faire échouer l'ajout de série.
      let n = setNumber;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await supabase.from("exercise_sets").insert({
          user_id: user.id,
          exercise_id: exerciseId,
          set_number: n,
          reps,
          weight,
        });
        if (!error) return;
        if (error.code !== "23505" || attempt === 1) throw error;
        const { data: maxRow, error: maxErr } = await supabase
          .from("exercise_sets")
          .select("set_number")
          .eq("exercise_id", exerciseId)
          .order("set_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxErr) throw maxErr;
        n = (maxRow?.set_number ?? n) + 1;
      }
    },
    onMutate: async ({ exerciseId, setNumber, reps, weight }) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,
                exercise_sets: [
                  ...ex.exercise_sets,
                  {
                    id: `tmp-${Date.now()}`,
                    set_number: setNumber,
                    reps,
                    weight,
                    completed: false,
                  },
                ],
              }
            : ex,
        ),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Met à jour reps / weight / completed d'une série. */
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
      completed?: boolean;
    }) => {
      // #1 : `completed` ne doit PAS être retiré — sinon la validation des séries n'est jamais enregistrée.
      if (Object.keys(fields).length === 0) return;
      // Garde : série optimiste pas encore confirmée par le serveur.
      if (id.startsWith("tmp-")) return;
      const { error } = await supabase
        .from("exercise_sets")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          exercise_sets: ex.exercise_sets.map((set) =>
            set.id === id ? { ...set, ...fields } : set,
          ),
        })),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Supprime une série par son id. */
export function useDeleteExerciseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith("tmp-")) return;
      const { error } = await supabase.from("exercise_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          exercise_sets: ex.exercise_sets.filter((set) => set.id !== id),
        })),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
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
