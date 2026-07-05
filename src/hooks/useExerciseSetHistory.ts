import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalize } from "@/lib/fitness/exerciseCatalog";

/**
 * Historique des séries détaillées (exercise_sets) d'un exercice, agrégé par séance.
 *
 * Recherche tous les exercices de l'utilisateur portant ce nom (insensible à la
 * casse), récupère leurs séries puis les regroupe par séance (workout + date),
 * triées par date croissante. Sert à alimenter les courbes de progression
 * (1RM, tonnage) et le détail série-par-série dans ExerciseStatsSheet.
 */

export interface ExerciseSessionSet {
  set_number: number;
  reps: number | null;
  weight: number | null;
}

export interface ExerciseSession {
  workoutId: string;
  date: string;
  sets: ExerciseSessionSet[];
}

interface ExerciseInstanceRow {
  id: string;
  workout_id: string;
  name: string;
  reps: number | null;
  weight: number | null;
  sets: number | null;
}

/**
 * Toutes les instances d'exercices de l'utilisateur (tous noms confondus),
 * mise en cache une seule fois par utilisateur. Plusieurs exercices affichés
 * en même temps (ex. le strip RPG) partagent ainsi ce fetch au lieu de le
 * relancer un par un.
 */
function useUserExerciseInstances(userId: string | undefined) {
  return useQuery({
    queryKey: ["exercise_instances_raw", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<ExerciseInstanceRow[]> => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, workout_id, name, reps, weight, sets")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as ExerciseInstanceRow[];
    },
  });
}

export function useExerciseSetHistory(exerciseName: string | null | undefined) {
  const { user } = useAuth();
  const key = normalize(exerciseName ?? "");
  const instances = useUserExerciseInstances(user?.id);

  return useQuery({
    queryKey: ["exercise_set_history", key, user?.id],
    enabled: key.length > 0 && !!user && !!instances.data,
    queryFn: async (): Promise<ExerciseSession[]> => {
      if (!exerciseName) return [];

      // 1. Instances de l'exercice (identité accent-insensible via normalize)
      const target = normalize(exerciseName);
      const exs = (instances.data ?? []).filter((e) => normalize(e.name) === target);
      if (exs.length === 0) return [];

      const exIds = exs.map((e) => e.id);
      const exToWorkout = new Map(exs.map((e) => [e.id, e.workout_id]));
      const workoutIds = Array.from(new Set(exs.map((e) => e.workout_id)));

      // 2. Séries détaillées de ces exercices
      // H3 : seules les séries validées comptent dans l'historique.
      const { data: sets, error: e2 } = await supabase
        .from("exercise_sets")
        .select("exercise_id, set_number, reps, weight")
        .in("exercise_id", exIds)
        .eq("completed", true)
        .order("set_number", { ascending: true });
      if (e2) throw e2;

      // 3. Dates des séances
      const { data: wks, error: e3 } = await supabase
        .from("workouts")
        .select("id, date")
        .in("id", workoutIds);
      if (e3) throw e3;
      const dateByWorkout = new Map((wks ?? []).map((w) => [w.id, w.date]));

      // 4. Regroupement par séance à partir des séries détaillées
      const byWorkout = new Map<string, ExerciseSessionSet[]>();
      const exWithDetailedSets = new Set<string>();
      for (const s of sets ?? []) {
        exWithDetailedSets.add(s.exercise_id);
        const wid = exToWorkout.get(s.exercise_id);
        if (!wid) continue;
        const list = byWorkout.get(wid) ?? [];
        list.push({
          set_number: s.set_number,
          reps: s.reps,
          weight: s.weight,
        });
        byWorkout.set(wid, list);
      }

      // 4bis. Repli sur le résumé agrégé (exercises.weight/reps/sets) pour les
      // instances sans aucune série détaillée validée — mêmes colonnes que
      // celles utilisées par computePRs, pour ne jamais faire disparaître un
      // exercice réellement pratiqué de la progression RPG.
      for (const ex of exs) {
        if (exWithDetailedSets.has(ex.id)) continue;
        if (ex.reps == null || ex.reps <= 0) continue;
        const list = byWorkout.get(ex.workout_id) ?? [];
        const count = Math.max(1, ex.sets ?? 1);
        for (let i = 0; i < count; i++) {
          list.push({ set_number: i + 1, reps: ex.reps, weight: ex.weight });
        }
        byWorkout.set(ex.workout_id, list);
      }

      if (byWorkout.size === 0) return [];

      const sessions: ExerciseSession[] = [];
      for (const [wid, sList] of byWorkout) {
        const date = dateByWorkout.get(wid);
        if (!date) continue;
        sList.sort((a, b) => a.set_number - b.set_number);
        sessions.push({ workoutId: wid, date, sets: sList });
      }
      sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return sessions;
    },
  });
}
