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
// (discipline, libellé canonique exact) convergent vers la même ligne
// sans dupliquer, et aucune autre colonne (description/media/config/
// aliases/is_active/category) n'est jamais écrasée par un appel de
// résolution.
//
// Étape 3 — règle de normalisation anti-doublon de casse : avant de créer
// une nouvelle référence, on cherche d'abord une référence existante dans
// la même discipline dont le nom est identique À LA CASSE PRÈS (ex.
// "squat" doit retrouver "Squat", pas créer une seconde ligne). Si elle
// existe, elle est réutilisée telle quelle (jamais renommée). Sinon, une
// nouvelle référence est créée avec le libellé canonique (voir ci-dessous).
// Cette même règle est appliquée par le script de backfill historique
// (supabase/scripts/phase3_step3_backfill_historique.sql) — voir
// docs/phase3-backfill-log.md pour le détail et la justification.
//
// Étape 4 (sous-étape) — canonicalisation vers l'exercice de base : un
// moteur de discipline peut générer plusieurs occurrences d'UN SEUL
// exercice avec des libellés d'affichage distincts par contexte
// (numéro de répétition, de série, etc.) — ex. "Fractionné 1/8" /
// "Fractionné 2/8", ou "Farmer Carry série 1" / "Farmer Carry série 2".
// Le libellé AFFICHÉ (stocké tel quel sur exercises.name /
// workout_segments.label pour chaque occurrence) peut contenir cette
// information de contexte ; la RÉSOLUTION, elle, doit toujours porter sur
// le libellé canonique de l'exercice de base, pour que toutes les
// occurrences d'un même exercice partagent un seul exercise_id — c'est le
// principe "un exercice = une identité" (voir
// cortex-exercice-referentiel-principes). Cette canonicalisation est
// centralisée ici (canonicalizeExerciseLabel), pas dans les moteurs de
// discipline, afin qu'elle s'applique automatiquement à toute discipline
// future générant ce type de variantes, sans logique dispersée.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { DisciplineId } from "@/lib/fitness/engines/types";

/**
 * Échappe les caractères spéciaux d'un motif ILIKE (`%`, `_`, `\`) afin que
 * `value` soit comparé comme une chaîne exacte (insensible à la casse),
 * jamais interprété comme un motif à jokers.
 */
function escapeForIlike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Suffixes de contexte reconnus, retirés un par un (dans cet ordre, en
 * boucle) pour remonter au libellé canonique de l'exercice de base. Chaque
 * motif est ancré en fin de chaîne (`$`) pour ne jamais toucher le début
 * ou le milieu d'un nom d'exercice légitime.
 *
 * Liste volontairement explicite et documentée plutôt qu'une règle
 * générique "retirer tout nombre final" (trop risquée : un nom d'exercice
 * pourrait légitimement se terminer par un nombre). Ajouter ici toute
 * nouvelle variante d'affichage rencontrée (nouvelle discipline, nouveau
 * moteur) plutôt que de dupliquer une logique de normalisation ailleurs.
 */
const CONTEXT_SUFFIX_PATTERNS: RegExp[] = [
  // "Fractionné 1/8", "Sprint 3 / 10", "(1/8)"
  /\s*\(?\d+\s*\/\s*\d+\)?\s*$/,
  // "Farmer Carry série 1", "... serie 2", "... set 3", "... tour 4",
  // "... rep 5" / "répétition 6" (accents optionnels, singulier/pluriel)
  /\s+(?:s[ée]ries?|sets?|tours?|reps?|r[ée]p[ée]titions?)\.?\s*n?°?\s*\d+\s*$/i,
  // "Exercice #3"
  /\s*#\s*\d+\s*$/,
];

/**
 * Réduit un libellé d'affichage à l'exercice de base qu'il représente, en
 * retirant tout suffixe de contexte reconnu (répétition, série, etc.).
 * Boucle sur les motifs jusqu'à stabilisation pour gérer les suffixes
 * composés (ex. "Sprint 1/8 - série 2"). Ne renvoie jamais une chaîne vide
 * : si le retrait des suffixes épuiserait le libellé, la version trimée
 * d'origine est conservée (filet de sécurité).
 */
export function canonicalizeExerciseLabel(rawLabel: string): string {
  const original = rawLabel.trim();
  let current = original;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of CONTEXT_SUFFIX_PATTERNS) {
      const next = current.replace(pattern, "").trim();
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }
  return current || original;
}

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
  const trimmed = label.trim();
  if (!trimmed) return null;
  const name = canonicalizeExerciseLabel(trimmed);
  if (!name) return null;

  // 1) Recherche insensible à la casse : ne jamais créer de doublon d'un
  // exercice déjà référencé sous une autre casse.
  const { data: existing, error: lookupError } = await supabase
    .from("exercise_reference")
    .select("id")
    .eq("discipline_id", discipline)
    .ilike("name", escapeForIlike(name))
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;

  // 2) Aucune correspondance : création avec le libellé canonique.
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
