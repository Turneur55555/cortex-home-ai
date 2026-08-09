// ============================================================
// Agrège les rangs d'exercices (moteur `rank/engine.ts`, inchangé) en
// rangs musculaires (`muscleRank.ts`), pour les 8 groupes du buste
// (`cortexPower.ts`). Domaine pur — zéro Supabase, zéro React.
//
// Réutilise `exerciseToMuscles()` (`lib/fitness/muscleMapping.ts`), la
// seule association exercice→muscle existante dans Cortex aujourd'hui —
// c'est un mapping plat par nom d'exercice (regex), sans pondération
// primaire/secondaire (cette donnée n'existe pas encore, vérifié en
// session). Tous les exercices contribuant à un muscle ont donc un poids
// égal (1 par défaut, voir `muscleRank.ts`).
// ============================================================

import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import { computeMuscleRank, type MuscleRankResult } from "./muscleRank";
import { BUSTE_MUSCLES, type BusteMuscleGroup } from "./cortexPower";

const BUSTE_MUSCLE_SET = new Set<string>(BUSTE_MUSCLES);

export interface RankedExercise {
  key: string;
  name: string;
  tierIndex: number;
}

/**
 * Rang de chaque groupe musculaire du buste à partir des rangs d'exercice
 * déjà calculés. Les muscles hors buste (jambes, lombaires…) que
 * `exerciseToMuscles` peut renvoyer sont ignorés — le buste ne couvre que
 * les 8 groupes du haut du corps.
 */
export function aggregateMuscleRanks(
  exercises: RankedExercise[],
): Record<BusteMuscleGroup, MuscleRankResult> {
  const byMuscle = new Map<BusteMuscleGroup, Array<{ key: string; tierIndex: number }>>();
  for (const muscle of BUSTE_MUSCLES) byMuscle.set(muscle, []);

  for (const ex of exercises) {
    const muscles = exerciseToMuscles(ex.name).filter((m) => BUSTE_MUSCLE_SET.has(m));
    for (const muscle of muscles as BusteMuscleGroup[]) {
      byMuscle.get(muscle)!.push({ key: ex.key, tierIndex: ex.tierIndex });
    }
  }

  const result = {} as Record<BusteMuscleGroup, MuscleRankResult>;
  for (const muscle of BUSTE_MUSCLES) {
    result[muscle] = computeMuscleRank(byMuscle.get(muscle)!);
  }
  return result;
}
