import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";

/**
 * Dernières séances terminées par exercice (identité accent-insensible via
 * normalize()), en excluant la séance active courante.
 *
 * Version groupée : une seule passe de requêtes pour TOUS les exercices de la
 * séance active (3 requêtes au total au lieu de 3 par carte → fin du N+1).
 * Sert à pré-remplir les charges et à afficher le comparatif "dernière séance".
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

const EMPTY = new Map<string, LastSession>();

export function useLastExerciseSessions(
  exerciseNames: string[],
  excludeWorkoutId: string | null | undefined,
): Map<string, LastSession> {
  const keys = Array.from(
    new Set(exerciseNames.map((n) => normalize(n)).filter((k) => k.length > 0)),
  ).sort();

  const q = useQuery({
    queryKey: ["last_exercise_sessions", keys.join("|"), excludeWorkoutId ?? ""],
    enabled: keys.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, LastSession>> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = new Map<string, LastSession>();
      if (!user) return result;

      // 1. Exercices de l'utilisateur correspondant aux noms (accent-insensible)
      const keySet = new Set(keys);
      const { data: allExs, error: e1 } = await supabase
        .from("exercises")
        .select("id, workout_id, name")
        .eq("user_id", user.id);
      if (e1) throw e1;
      const exs = (allExs ?? [])
        .map((e) => ({ id: e.id, workoutId: e.workout_id, key: normalize(e.name) }))
        .filter(
          (e) =>
            keySet.has(e.key) && !!e.workoutId && e.workoutId !== excludeWorkoutId,
        );
      if (exs.length === 0) return result;

      // 2. Dates des séances concernées
      const workoutIds = Array.from(new Set(exs.map((e) => e.workoutId as string)));
      const { data: wks, error: e2 } = await supabase
        .from("workouts")
        .select("id, date")
        .in("id", workoutIds);
      if (e2) throw e2;
      const dateByWorkout = new Map((wks ?? []).map((w) => [w.id, w.date]));

      // 3. Toutes les séries de ces exercices en une seule requête
      const exIds = exs.map((e) => e.id);
      const { data: sets, error: e3 } = await supabase
        .from("exercise_sets")
        .select("exercise_id, set_number, reps, weight")
        .in("exercise_id", exIds)
        .order("set_number", { ascending: true });
      if (e3) throw e3;

      const exById = new Map(exs.map((e) => [e.id, e]));
      const byKeyWorkout = new Map<string, Map<string, LastSessionSet[]>>();
      for (const s of sets ?? []) {
        const ex = exById.get(s.exercise_id);
        if (!ex || !ex.workoutId) continue;
        if (!byKeyWorkout.has(ex.key)) byKeyWorkout.set(ex.key, new Map());
        const wm = byKeyWorkout.get(ex.key)!;
        const list = wm.get(ex.workoutId) ?? [];
        list.push({ set_number: s.set_number, reps: s.reps, weight: s.weight });
        wm.set(ex.workoutId, list);
      }

      // 4. Pour chaque exercice : séance la plus récente avec ≥ 1 série remplie
      for (const [key, wm] of byKeyWorkout) {
        const ordered = Array.from(wm.entries())
          .map(([wid, rows]) => ({ wid, date: dateByWorkout.get(wid) ?? "", rows }))
          .filter((x) => x.date)
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        for (const { wid, date, rows } of ordered) {
          const filtered = rows
            .filter((r) => r.reps != null || r.weight != null)
            .sort((a, b) => a.set_number - b.set_number);
          if (filtered.length === 0) continue;
          result.set(key, { workoutId: wid, date, sets: filtered });
          break;
        }
      }
      return result;
    },
  });

  return q.data ?? EMPTY;
}
