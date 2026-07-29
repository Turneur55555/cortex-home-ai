// ============================================================
// Badges d'exercice partagés (Hero de la fiche + lignes du catalogue) —
// dérivés de signaux déjà validés ailleurs dans le domaine (catégorie du
// catalogue, équipement du dataset, coefficient de difficulté déjà utilisé
// par computePhysicalImpact), jamais un champ fabriqué. Centralisé ici pour
// qu'aucun composant ne réimplémente sa propre version de ces règles.
// ============================================================

import { exerciseDifficulty } from "./exerciseRanks";

export interface ExerciseBadgeSource {
  category?: string | null;
  equipment?: string | null;
}

export function deriveExerciseBadges(name: string, source: ExerciseBadgeSource): string[] {
  const chips: string[] = [];
  if (source.category) chips.push(source.category);
  if (source.equipment) chips.push(source.equipment);
  chips.push(exerciseDifficulty(name) >= 1.4 ? "Polyarticulaire" : "Isolation");
  return chips;
}
