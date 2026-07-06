// ============================================================
// Suggestions d'exercices similaires (domaine pur, déterministe).
// Utilisé par la fiche « Découverte » du Catalogue pour proposer des
// variantes quand un exercice n'a jamais été pratiqué. Le score est
// basé uniquement sur des données déjà validées ailleurs dans l'app
// (rôles musculaires de l'exercice + groupe du catalogue) : aucune
// donnée n'est inventée ici.
// ============================================================

import { normalize } from "./exerciseCatalog";
import { resolveMuscleRoles } from "./analysis/muscleRoles";

export interface SimilarCandidate {
  name: string;
  group: string;
}

/**
 * Retourne jusqu'à `limit` exercices du catalogue partageant au moins un
 * muscle principal avec `exercise`, triés par pertinence (recouvrement des
 * muscles principaux, puis appartenance au même groupe). Ne renvoie rien
 * si aucun recouvrement n'est trouvé plutôt que de proposer des exercices
 * sans rapport.
 */
export function findSimilarExercises(
  exercise: SimilarCandidate,
  catalog: ReadonlyArray<SimilarCandidate>,
  limit = 4,
): SimilarCandidate[] {
  const target = normalize(exercise.name);
  const targetPrimary = new Set(resolveMuscleRoles(exercise.name).primary);
  if (targetPrimary.size === 0) return [];

  const scored: Array<{ candidate: SimilarCandidate; score: number }> = [];
  const seen = new Set<string>();

  for (const c of catalog) {
    const key = normalize(c.name);
    if (key === target || seen.has(key)) continue;
    seen.add(key);

    const roles = resolveMuscleRoles(c.name);
    const overlap = roles.primary.filter((m) => targetPrimary.has(m)).length;
    if (overlap === 0) continue;

    const sameGroup = c.group === exercise.group ? 1 : 0;
    scored.push({ candidate: c, score: overlap * 2 + sameGroup });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.candidate);
}
