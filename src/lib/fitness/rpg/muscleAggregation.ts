// ============================================================
// Agrège les rangs d'exercices (moteur `rank/engine.ts`, inchangé) en
// rangs musculaires (`muscleRank.ts`), pour les 8 groupes du buste
// (`cortexPower.ts`). Domaine pur — zéro Supabase, zéro React.
//
// Réutilise `exerciseToMuscles()` (`lib/fitness/muscleMapping.ts`), la
// seule association exercice→muscle existante dans Cortex aujourd'hui.
//
// Pondération primaire/secondaire (audit RPG V2, 29/08/2026) : Cortex ne
// possède aucune donnée de rôle par exercice (pas de champ "primaire/
// secondaire" en base) — cette pondération est donc DÉRIVÉE de l'ordre
// déjà existant dans `EXERCISE_TO_MUSCLES` (`muscleMapping.ts`), pas
// inventée. Cet ordre encode déjà, implicitement, le moteur principal
// d'un mouvement : ex. `["dos","biceps"]` pour un tirage (dos = moteur
// principal), `["pectoraux","triceps","epaules"]` pour un développé
// couché (pectoraux = moteur principal). Vérifié sur le catalogue réel
// Cortex (audit) : pour un muscle donné, un exercice est
//   - "primaire" (poids 1,0) si ce muscle est le PREMIER de sa liste
//     (mouvement composé dont c'est le moteur principal, OU mouvement
//     mono-muscle — curl pour biceps, développé militaire pour épaules) ;
//   - "secondaire" (poids 0,4) s'il apparaît plus loin dans la liste
//     (muscle synergiste d'un mouvement composé dont un AUTRE muscle est
//     le moteur principal — ex. triceps dans un développé couché) : le
//     rang de cet exercice reflète surtout la capacité du moteur
//     principal, pas celle de ce muscle-ci, d'où le poids réduit.
//
// Poids repris de la convention déjà documentée dans `muscleRank.ts`
// (primaire=1, secondaire=0.4) — pas un nouveau coefficient inventé pour
// cette session.
// ============================================================

import { exerciseToMuscles, type MuscleId } from "@/lib/fitness/muscleMapping";
import { computeMuscleRank, type MuscleRankResult } from "./muscleRank";
import { BUSTE_MUSCLES, type BusteMuscleGroup } from "./cortexPower";

const BUSTE_MUSCLE_SET = new Set<string>(BUSTE_MUSCLES);

export const EXERCISE_ROLE_WEIGHT = {
  primary: 1,
  secondary: 0.4,
} as const;

export interface RankedExercise {
  key: string;
  name: string;
  tierIndex: number;
}

/**
 * Rôle d'un exercice pour un muscle donné : "primaire" si ce muscle est le
 * premier de la liste renvoyée par `exerciseToMuscles` (moteur principal
 * du mouvement, composé ou mono-muscle), "secondaire" sinon (muscle
 * synergiste). Calculé sur la liste COMPLÈTE (avant filtrage buste), pour
 * qu'un muscle hors buste listé en premier (ex. quadriceps pour un squat)
 * ne fasse pas passer à tort un muscle du buste listé ensuite pour
 * "primaire".
 */
function roleFor(muscle: BusteMuscleGroup, allMuscles: MuscleId[]): "primary" | "secondary" {
  return allMuscles[0] === muscle ? "primary" : "secondary";
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
  const byMuscle = new Map<
    BusteMuscleGroup,
    Array<{ key: string; tierIndex: number; weight: number }>
  >();
  for (const muscle of BUSTE_MUSCLES) byMuscle.set(muscle, []);

  for (const ex of exercises) {
    const allMuscles = exerciseToMuscles(ex.name);
    const busteMuscles = allMuscles.filter((m) => BUSTE_MUSCLE_SET.has(m));
    for (const muscle of busteMuscles as BusteMuscleGroup[]) {
      const role = roleFor(muscle, allMuscles);
      byMuscle.get(muscle)!.push({
        key: ex.key,
        tierIndex: ex.tierIndex,
        weight: EXERCISE_ROLE_WEIGHT[role],
      });
    }
  }

  const result = {} as Record<BusteMuscleGroup, MuscleRankResult>;
  for (const muscle of BUSTE_MUSCLES) {
    result[muscle] = computeMuscleRank(byMuscle.get(muscle)!);
  }
  return result;
}
