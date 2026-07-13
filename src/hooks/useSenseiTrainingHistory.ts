import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Historique LARGE dédié à l'analyse Sensei (progression par exercice,
 * volume par groupe musculaire, cycles passés...) — délibérément séparé de
 * useWorkouts() (hooks/use-fitness.ts), qui reste borné à 60 séances pour
 * l'historique affiché partout ailleurs dans l'app (Chroniques complètes,
 * WorkoutCard, MuscleMap...). Changer cette limite partagée aurait un
 * impact large et non nécessaire ; ce hook dédié suit la même convention
 * de "requête large" déjà utilisée ailleurs (computeBroadActivity appelé
 * avec limit=500 pour la Progression RPG, vs limit=8 en vitrine).
 *
 * Sélectionne aussi les colonnes résumé (`exercises.reps/weight/sets`) en
 * plus des séries détaillées : nécessaire pour que l'analyse reste valide
 * sur les séances antérieures au set-by-set (avant le 13/06/2026), qui
 * n'ont aucune ligne `exercise_sets` — voir senseiAutoProfile.ts.
 *
 * Étape 4.6b (2026-07-13) : `exercise_reference_id` ajouté à la sélection
 * `exercises(...)` — sans lui, senseiAutoProfile.ts ne peut pas migrer son
 * identité interne vers exercise_reference_id (le champ resterait toujours
 * `undefined` côté client malgré des données correctes en base, même piège
 * déjà rencontré et documenté sur useActiveWorkout, voir
 * cortex-select-postgrest-piege). Colonne additive, ne change rien au
 * comportement pour les appelants qui l'ignorent.
 */
export function useSenseiTrainingHistory() {
  return useQuery({
    queryKey: ["sensei_training_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select(
          "date, discipline, duration_minutes, exercises(name, reps, weight, sets, exercise_reference_id, exercise_sets(reps, weight, completed, rest_seconds))",
        )
        .order("date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}
