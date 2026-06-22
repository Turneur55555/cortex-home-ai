import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dernière séance terminée contenant un exercice donné (par nom, insensible
 * à la casse), en excluant la séance active courante.
 *
 * Sert à pré-remplir les charges et à afficher un comparatif "dernière séance"
 * dans ActiveExerciseCard pour faciliter la surcharge progressive.
 */
export interface LastSessionSet {
  set_number: number;
  reps: number | null;
  weight: number | null;
}

export interface LastSession {
  workoutId: string;
  date: string;
  sets: LastSessionSet[];
}

export function useLastExerciseSession(
  exerciseName: string | null | undefined,
  excludeWorkoutId: string | null | undefined,
) {
  const key = exerciseName?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: ["last_exercise_session", key, excludeWorkoutId ?? ""],
    enabled: key.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LastSession | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !exerciseName) return null;

      // 1. Tous les exercices portant ce nom
      const { data: exs, error: e1 } = await supabase
        .from("exercises")
        .select("id, workout_id")
        .eq("user_id", user.id)
        .ilike("name", exerciseName.trim());
      if (e1) throw e1;
      if (!exs || exs.length === 0) return null;

      const exToWorkout = new Map(exs.map((e) => [e.id, e.workout_id]));
      const workoutIds = Array.from(
        new Set(
          exs
            .map((e) => e.workout_id)
            .filter((id): id is string => !!id && id !== excludeWorkoutId),
        ),
      );
      if (workoutIds.length === 0) return null;

      // 2. Trouver la séance la plus récente
      const { data: wks, error: e3 } = await supabase
        .from("workouts")
        .select("id, date")
        .in("id", workoutIds)
        .order("date", { ascending: false })
        .limit(20);
      if (e3) throw e3;
      if (!wks || wks.length === 0) return null;

      // Itère sur les séances par date décroissante : retient la première
      // qui contient au moins une série avec reps ou weight renseignés.
      for (const w of wks) {
        const exIdsForThisWorkout = exs
          .filter((e) => exToWorkout.get(e.id) === w.id)
          .map((e) => e.id);
        if (exIdsForThisWorkout.length === 0) continue;

        const { data: sets, error: e2 } = await supabase
          .from("exercise_sets")
          .select("set_number, reps, weight")
          .in("exercise_id", exIdsForThisWorkout)
          .order("set_number", { ascending: true });
        if (e2) throw e2;

        const filtered = (sets ?? []).filter(
          (s) => s.reps != null || s.weight != null,
        );
        if (filtered.length === 0) continue;

        return {
          workoutId: w.id,
          date: w.date,
          sets: filtered.map((s) => ({
            set_number: s.set_number,
            reps: s.reps,
            weight: s.weight,
          })),
        };
      }
      return null;
    },
  });
}
