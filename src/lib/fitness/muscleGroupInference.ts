// Résolution du groupe musculaire principal affiché pour un exercice de la
// bibliothèque (voir docs/architecture/exercises-dataset-integration.md §14) —
// garantit qu'un badge de groupe musculaire est TOUJOURS affiché, jamais vide.
//
// Ordre de résolution (demandé par Nathan, 2026-08) :
//   1. Le groupe musculaire déjà renseigné dans Cortex (`category`) ;
//   2. À défaut, celui déjà connu via l'enrichissement dataset (`config.muscle_group`) ;
//   3. À défaut, déduit automatiquement du nom de l'exercice ;
//   4. À défaut (aucun signal disponible), un intitulé neutre non vide.
//
// Réutilise `exerciseToMuscles` (muscleMapping.ts), déjà le moteur de
// déduction nom -> muscles employé ailleurs dans Cortex (recovery map) —
// zéro duplication de règles. Un petit jeu de priorités additionnel gère les
// deux angles morts de ce moteur pour cet usage précis :
//   - `exerciseToMuscles` ne mappe volontairement pas les mouvements
//     d'échauffement/retour au calme/combinés (pas un muscle unique) ;
//   - la règle générique "oblique|rotation" y capture à tort les rotations
//     d'épaule (coiffe des rotateurs) — interceptée ici AVANT l'appel, sans
//     toucher au fichier partagé par le calcul de récupération musculaire.
import { exerciseToMuscles, MUSCLE_META } from "./muscleMapping";

export const UNCATEGORIZED_MUSCLE_GROUP = "Non catégorisé";

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Vérifiées AVANT `exerciseToMuscles` — cas où son résultat serait absent ou
// incorrect pour cet usage (voir commentaire d'en-tête).
const PRE_OVERRIDES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /rotation.*epaule|epaule.*rotation|coiffe des rotateurs|rotator cuff/i, label: "Épaules" },
  { pattern: /developpe(?!.?militaire)/i, label: "Pectoraux" },
  // Audit RPG V2 Phase H (30/08/2026) : `exerciseToMuscles` mappe désormais
  // "Farmer's carry/walk" vers trapèzes/avant-bras (correct pour le Rang
  // musculaire — voir muscleMapping.ts) mais ce badge de bibliothèque veut
  // rester neutre pour les ports de charge (aucun muscle dominant unique du
  // point de vue "quel groupe travailler aujourd'hui"). Interceptée ici
  // AVANT l'appel, comme la rotation d'épaule ci-dessus, sans toucher au
  // fichier partagé par le Rang musculaire.
  { pattern: /farmer.?s?.?(carry|walk)/i, label: "Polyarticulaire" },
];

// Mouvements sans muscle unique dominant — jamais mappés par
// `exerciseToMuscles` (comportement volontaire de ce moteur), donc jamais de
// faux négatif à corriger : juste un intitulé neutre non vide.
const NON_MUSCLE_BUCKETS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /echauffement|activation articulaire|mobilisation articulaire/i,
    label: "Échauffement",
  },
  {
    pattern: /retour au calme|etirement|relaxation|respiration/i,
    label: "Récupération",
  },
  {
    pattern: /full.?body|farmer|wall.?ball|circuit|flow|complex|carry|haut du corps.*stabilite|haut du corps.*gainage/i,
    label: "Polyarticulaire",
  },
];

/** Déduit un groupe musculaire à partir du seul nom de l'exercice, ou `null` si aucun signal. */
export function inferMuscleGroupFromName(name: string): string | null {
  const normalized = stripDiacritics(name.toLowerCase());

  for (const { pattern, label } of PRE_OVERRIDES) {
    if (pattern.test(normalized)) return label;
  }

  const muscles = exerciseToMuscles(name);
  if (muscles.length > 0) return MUSCLE_META[muscles[0]].label;

  for (const { pattern, label } of NON_MUSCLE_BUCKETS) {
    if (pattern.test(normalized)) return label;
  }

  return null;
}

export interface MuscleGroupSource {
  category?: string | null;
  config?: { muscle_group?: string | null } | null;
}

/** Résout le groupe musculaire affiché — ne retourne jamais une chaîne vide. */
export function resolveMuscleGroup(row: MuscleGroupSource, name: string): string {
  if (row.category) return row.category;
  if (row.config?.muscle_group) return row.config.muscle_group;
  return inferMuscleGroupFromName(name) ?? UNCATEGORIZED_MUSCLE_GROUP;
}
