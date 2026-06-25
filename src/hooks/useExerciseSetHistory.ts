import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  rpe: number | null;
}

export interface ExerciseSession {
  workoutId: string;
  date: string;
  sets: ExerciseSessionSet[];
}

export function useExerciseSetHistory(exerciseName: string | null | undefined) {
  const key = normalize(exerciseName ?? "");
  return useQuery({
    queryKey: ["exercise_set_history", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<ExerciseSession[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !exerciseName) return [];

      // 1. Instances de l'exercice (identité accent-insensible via normalize)
      const target = normalize(exerciseName);
      const { data: allExs, error: e1 } = await supabase
        .from("exercises")
        .select("id, workout_id, name")
        .eq("user_id", user.id);
      if (e1) throw e1;
      const exs = (allExs ?? []).filter((e) => normalize(e.name) === target);
      if (exs.length === 0) return [];

      const exIds = exs.map((e) => e.id);
      const exToWorkout = new Map(exs.map((e) => [e.id, e.workout_id]));
      const workoutIds = Array.from(new Set(exs.map((e) => e.workout_id)));

      // 2. Séries de ces exercices
      const { data: sets, error: e2 } = await supabase
        .from("exercise_sets")
        .select("exercise_id, set_number, reps, weight, rpe")
        .in("exercise_id", exIds)
        .order("set_number", { ascending: true });
      if (e2) throw e2;
      if (!sets || sets.length === 0) return [];

      // 3. Dates des séances
      const { data: wks, error: e3 } = await supabase
        .from("workouts")
        .select("id, date")
        .in("id", workoutIds);
      if (e3) throw e3;
      const dateByWorkout = new Map((wks ?? []).map((w) => [w.id, w.date]));

      // 4. Regroupement par séance
      const byWorkout = new Map<string, ExerciseSessionSet[]>();
      for (const s of sets) {
        const wid = exToWorkout.get(s.exercise_id);
        if (!wid) continue;
        const list = byWorkout.get(wid) ?? [];
        list.push({
          set_number: s.set_number,
          reps: s.reps,
          weight: s.weight,
          rpe: s.rpe,
        });
        byWorkout.set(wid, list);
      }

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
