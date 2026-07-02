/**
 * Force / volume primitives (domaine pur, zéro React).
 */

/**
 * 1RM estimé via la formule d'Epley:
 *   1RM = weight * (1 + reps / 30)
 * Retourne null si les entrées sont invalides.
 * Pour reps = 1, retourne weight tel quel.
 */
export function estimate1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (weight == null || reps == null) return null;
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weight * 10) / 10;
  const oneRm = weight * (1 + reps / 30);
  return Math.round(oneRm * 10) / 10;
}

/**
 * Tonnage d'un set: sets * reps * weight (kg).
 * Retourne 0 si une donnée manque.
 */
export function setTonnage(
  sets: number | null | undefined,
  reps: number | null | undefined,
  weight: number | null | undefined,
): number {
  if (!sets || !reps || !weight) return 0;
  if (sets <= 0 || reps <= 0 || weight <= 0) return 0;
  return sets * reps * weight;
}

/** Une série détaillée (table `exercise_sets`). Le poids peut arriver en string (numeric). */
type DetailedSet = {
  reps?: number | string | null;
  weight?: number | string | null;
  /** H3 : false = série non validée → exclue du tonnage. Absent = comptée (rétro-compat). */
  completed?: boolean | null;
};

/**
 * Tonnage d'un exercice. Si des séries détaillées (`exercise_sets`) existent,
 * on les utilise comme source de vérité ; sinon on retombe sur les colonnes
 * agrégées legacy (sets/reps/weight) de la ligne `exercises`.
 */
export function exerciseTonnage(ex: {
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  exercise_sets?: DetailedSet[] | null;
}): number {
  const detailed = ex.exercise_sets ?? [];
  if (detailed.length > 0) {
    return detailed.reduce((acc, s) => {
      if (s.completed === false) return acc;
      const reps = Number(s.reps);
      const weight = Number(s.weight);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) return acc;
      if (reps <= 0 || weight <= 0) return acc;
      return acc + reps * weight;
    }, 0);
  }
  return setTonnage(ex.sets, ex.reps, ex.weight);
}

/**
 * Tonnage cumulé d'une liste d'exercices.
 */
export function workoutTonnage(
  exercises: Array<{
    sets?: number | null;
    reps?: number | null;
    weight?: number | null;
    exercise_sets?: DetailedSet[] | null;
  }>,
): number {
  return exercises.reduce((acc, ex) => acc + exerciseTonnage(ex), 0);
}

/**
 * Formate un tonnage en kg ou tonnes selon la magnitude.
 */
export function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}
