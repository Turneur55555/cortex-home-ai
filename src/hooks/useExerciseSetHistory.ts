import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalize } from "@/lib/fitness/exerciseCatalog";

/**
 * Historique des séries détaillées (exercise_sets) d'un exercice, agrégé par séance.
 *
 * Phase 3, Étape 4 — bascule lecture par exercise_id : l'identification des
 * instances appartenant à "cet exercice" se fait désormais PRIORITAIREMENT
 * via `exercise_reference_id` (l'identité métier stable, voir
 * cortex-exercice-referentiel-principes) plutôt que par comparaison de nom
 * normalisé. Le nom reste utilisé pour (a) retrouver quel `exercise_reference_id`
 * correspond au libellé demandé par l'appelant (qui continue de passer un nom,
 * aucun changement de signature nécessaire — double lecture transparente pour
 * tous les appelants), et (b) filet de compatibilité pour d'éventuelles lignes
 * historiques non liées (`exercise_reference_id IS NULL`, ne devrait plus
 * arriver après le backfill de l'Étape 3, mais on ne suppose jamais une
 * migration 100% complète en toute circonstance — voir Étape 7 pour la
 * contrainte NOT NULL finale qui rendra ce filet inutile).
 *
 * Sert à alimenter les courbes de progression (1RM, tonnage) et le détail
 * série-par-série dans ExerciseAnalysisSheet.
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
  exercise_reference_id: string | null;
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
        .select("id, workout_id, name, reps, weight, sets, exercise_reference_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as ExerciseInstanceRow[];
    },
  });
}

/**
 * Sélectionne les instances appartenant à l'exercice demandé.
 *
 * Priorité à `exercise_reference_id` : parmi les instances dont le nom
 * normalisé correspond au libellé demandé, si elles pointent toutes vers
 * une seule et même référence, c'est CETTE référence qui fait foi — le
 * filtrage final se fait par id, pas par nom (capture ainsi toute instance
 * liée à la même référence même si son libellé brut diffère légèrement).
 *
 * Filet de compatibilité : si aucune instance liée par nom n'a de référence
 * (`exercise_reference_id` encore NULL) ou si plusieurs références
 * distinctes coexistent pour le même nom normalisé (incohérence de données,
 * ne devrait pas arriver après le backfill de l'Étape 3 — signalé en
 * console pour investigation), on retombe sur l'ancien comportement
 * (comparaison de nom normalisé), pour ne jamais faire disparaître des
 * données réelles pendant la transition.
 */
function selectInstancesForExercise(
  instances: ExerciseInstanceRow[],
  exerciseName: string,
): ExerciseInstanceRow[] {
  const target = normalize(exerciseName);
  const byName = instances.filter((e) => normalize(e.name) === target);
  if (byName.length === 0) return [];

  const refIds = new Set(
    byName.map((e) => e.exercise_reference_id).filter((id): id is string => !!id),
  );

  if (refIds.size === 1) {
    const [refId] = refIds;
    return instances.filter((e) => e.exercise_reference_id === refId);
  }

  if (refIds.size > 1) {
    console.error(
      "[useExerciseSetHistory] Incohérence : plusieurs exercise_reference_id distincts pour le même nom normalisé, repli sur la comparaison par nom.",
      { exerciseName, refIds: Array.from(refIds) },
    );
  }

  // refIds.size === 0 (aucune instance encore liée) ou > 1 (incohérence) :
  // filet de compatibilité, comportement identique à avant l'Étape 4.
  return byName;
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

      // 1. Instances de l'exercice (identité par exercise_reference_id,
      // filet de compatibilité par nom normalisé — voir selectInstancesForExercise)
      const exs = selectInstancesForExercise(instances.data ?? [], exerciseName);
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
