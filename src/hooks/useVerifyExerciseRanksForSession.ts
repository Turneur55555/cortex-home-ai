import { supabase } from "@/integrations/supabase/client";

/**
 * Déclenche automatiquement la vérification serveur de Rang pour chaque
 * exercice distinct d'une séance qui vient de se terminer — plus jamais
 * besoin d'ouvrir la fiche d'un exercice pour recevoir l'XP de montée de
 * Rang. Best-effort, non bloquant : une erreur réseau ici ne doit jamais
 * empêcher la clôture de séance. Idempotent côté serveur (dedup_key par
 * exercice+Titre), rappeler cette fonction plusieurs fois est sans risque.
 */
export function verifyExerciseRanksForSession(
  exercises: Array<{ name: string; exercise_reference_id?: string | null }> | null | undefined,
): void {
  if (!exercises?.length) return;

  const seen = new Set<string>();
  for (const ex of exercises) {
    const key = ex.exercise_reference_id ?? ex.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    void supabase.functions
      .invoke("verify-exercise-rank", {
        body: {
          exercise_name: ex.name,
          exercise_reference_id: ex.exercise_reference_id ?? null,
        },
      })
      .catch((e) => {
        console.error("[verifyExerciseRanksForSession] échec pour", ex.name, e);
      });
  }
}
