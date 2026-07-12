import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { identityKey } from "@/lib/fitness/recentExercises";

/**
 * Dernières séances terminées par exercice, en excluant la séance active
 * courante.
 *
 * Étape 4.5 (2026-07-12) — bascule identité : chaque exercice de la séance
 * active porte désormais (quand disponible) son `exerciseReferenceId`
 * (`exercises.exercise_reference_id`, résolu via ExerciseResolutionService).
 * La correspondance avec l'historique se fait en priorité par cet id
 * (`identityKey`, même fonction que `recentExercises.ts` — une seule
 * logique d'identité partagée). Filet de compatibilité : si l'exercice
 * n'a pas encore de référence résolue, repli sur le nom normalisé, comme
 * avant. Contrat public élargi (l'appelant doit désormais fournir
 * `exerciseReferenceId` en plus du nom — un seul appelant, ActiveWorkoutView).
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

export interface LastExerciseSessionQuery {
  name: string;
  exerciseReferenceId?: string | null;
}

const EMPTY = new Map<string, LastSession>();

export function useLastExerciseSessions(
  exercises: LastExerciseSessionQuery[],
  excludeWorkoutId: string | null | undefined,
): Map<string, LastSession> {
  // Dédoublonnage par identité (id en priorité, nom normalisé en filet) ;
  // les entrées sans id ET sans nom exploitable (chaîne vide après trim) ne
  // correspondront jamais à rien en base, on les écarte donc en amont.
  const keys = Array.from(
    new Set(
      exercises
        .filter((e) => !!e.exerciseReferenceId || normalize(e.name).length > 0)
        .map((e) => identityKey({ name: e.name, exercise_reference_id: e.exerciseReferenceId })),
    ),
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

      // 1. Tous les exercices musculation de l'utilisateur (id + référence +
      // nom) — le filtrage par identité (id en priorité, nom en filet) se
      // fait ensuite en mémoire, comme pour les autres hooks migrés.
      const keySet = new Set(keys);
      const { data: allExs, error: e1 } = await supabase
        .from("exercises")
        .select("id, workout_id, name, exercise_reference_id")
        .eq("user_id", user.id);
      if (e1) throw e1;
      const exs = (allExs ?? [])
        .map((e) => ({
          id: e.id,
          workoutId: e.workout_id,
          key: identityKey({ name: e.name, exercise_reference_id: e.exercise_reference_id }),
        }))
        .filter((e) => keySet.has(e.key) && !!e.workoutId && e.workoutId !== excludeWorkoutId);
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
      // H3 : seules les séries validées servent de référence.
      const { data: sets, error: e3 } = await supabase
        .from("exercise_sets")
        .select("exercise_id, set_number, reps, weight")
        .in("exercise_id", exIds)
        .eq("completed", true)
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
