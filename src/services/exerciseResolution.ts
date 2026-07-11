// ============================================================
// ExerciseResolutionService — Phase 3 (restructuration exercice-central,
// voir ICORTEX_Architecture_Cible_Exercice_2026-07-11.md section 6).
//
// Résout un libellé texte (généré par un moteur, ou saisi librement par
// l'utilisateur) vers un `exercise_id` stable dans `exercise_reference`,
// en créant l'entrée si elle n'existe pas encore pour cette discipline.
//
// Étape 2 (double écriture) : ce service est appelé EN PLUS du chemin
// d'écriture par libellé existant — aucun chemin de LECTURE ne change
// encore (voir memory cortex-phase3-progress-2026-07). exercise_id reste
// nullable partout ; une erreur de résolution ne doit jamais bloquer
// l'écriture principale (voir appelants dans use-fitness.ts et
// useGenericActiveSession.ts, qui encapsulent l'appel dans un try/catch
// local).
//
// Concurrence : s'appuie sur la contrainte unique (discipline_id, name)
// posée sur exercise_reference en Étape 0. L'upsert ciblé sur ces deux
// colonnes est donc idempotent : deux appels concurrents pour le même
// (discipline, libellé) convergent vers la même ligne sans dupliquer, et
// aucune autre colonne (description/media/config/aliases/is_active/
// category) n'est jamais écrasée par un appel de résolution.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { DisciplineId } from "@/lib/fitness/engines/types";

/**
 * Résout (ou crée) l'exercise_id correspondant à `label` pour `discipline`.
 * Retourne `null` si le libellé est vide après trim (rien à résoudre).
 * Lève une erreur Supabase en cas d'échec réseau/RLS — à la charge de
 * l'appelant de décider si cela doit bloquer l'écriture principale (pour
 * Étape 2, la réponse est non : voir commentaire d'en-tête).
 */
export async function resolveExerciseId(
  discipline: DisciplineId,
  label: string,
): Promise<string | null> {
  const name = label.trim();
  if (!name) return null;

  const { data, error } = await supabase
    .from("exercise_reference")
    .upsert(
      { discipline_id: discipline, name },
      { onConflict: "discipline_id,name", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}
