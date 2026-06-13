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

/**
 * Tonnage cumulé d'une liste d'exercices.
 */
export function workoutTonnage(
  exercises: Array<{ sets?: number | null; reps?: number | null; weight?: number | null }>,
): number {
  return exercises.reduce((acc, ex) => acc + setTonnage(ex.sets, ex.reps, ex.weight), 0);
}

/**
 * Formate un tonnage en kg ou tonnes selon la magnitude.
 */
export function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}
