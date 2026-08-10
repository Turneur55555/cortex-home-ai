// ============================================================
// Buste 3D — Rang musculaire → influence de shape key (0..1).
//
// Domaine pur, zéro import React/Three.js. Consomme uniquement la sortie
// déjà calculée par `aggregateMuscleRanks` (`muscleAggregation.ts`, Méthode
// C, inchangée) — ce module ne recalcule RIEN, il normalise une échelle
// 0-29 déjà verrouillée vers l'intervalle [0,1] attendu par un shape key
// glTF ("evolution", voir docs/architecture/rpg-buste-3d-blender-workflow.md
// §7). Le Titre global n'intervient JAMAIS ici : chaque zone reçoit
// uniquement SON PROPRE Rang musculaire (exigence RPG explicite).
// ============================================================

import { TOTAL_TIERS } from "@/lib/fitness/exerciseRanks";
import type { BusteMuscleGroup } from "./cortexPower";
import type { MuscleRankResult } from "./muscleRank";

/** Palier maximum de l'échelle 0-29 (verrouillée) — `TOTAL_TIERS - 1`. */
const MAX_TIER_INDEX = TOTAL_TIERS - 1;

/** Identifiant de zone Blender/GLB — voir §2 du workflow (nom EXACT attendu
 *  côté modèle 3D). Mappé 1:1 sur `BusteMuscleGroup`, aucune nouvelle
 *  taxonomie. */
export const BUSTE_ZONE_BY_MUSCLE: Record<BusteMuscleGroup, string> = {
  pectoraux: "chest",
  dos: "back",
  epaules: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  "avant-bras": "forearms",
  trapeze: "traps",
  abdos: "abs",
};

export type BusteZoneEvolution = {
  /** Nom exact de l'objet/mesh attendu dans le GLB. */
  zone: string;
  /** Influence du shape key `evolution`, 0.0 (non évalué/minimum) à 1.0 (Titan, palier 29). */
  influence: number;
  /** Rang musculaire brut, null si non évalué (< 2 exercices contributeurs). */
  tierIndex: number | null;
};

/**
 * Influence continue du shape key `evolution` pour UN muscle. Un muscle
 * "non évalué" (< 2 exercices) reste à l'état minimum (0) — jamais un état
 * inventé, même règle que "non classé" pour le Titre global.
 */
export function influenceForMuscleRank(result: MuscleRankResult): number {
  if (result.status !== "evaluated") return 0;
  const clamped = Math.max(0, Math.min(MAX_TIER_INDEX, result.tierIndex));
  return clamped / MAX_TIER_INDEX;
}

/**
 * Dérive l'évolution des 8 zones du buste à partir des Rangs musculaires
 * déjà calculés (`aggregateMuscleRanks`). Fonction pure, testée
 * indépendamment du rendu 3D — le composant React Three Fiber n'a plus
 * qu'à appliquer `influence` à `mesh.morphTargetInfluences[0]` par zone.
 */
export function busteEvolutionFromMuscleRanks(
  muscleRanks: Record<BusteMuscleGroup, MuscleRankResult>,
): BusteZoneEvolution[] {
  return (Object.entries(muscleRanks) as Array<[BusteMuscleGroup, MuscleRankResult]>).map(
    ([muscle, result]) => ({
      zone: BUSTE_ZONE_BY_MUSCLE[muscle],
      influence: influenceForMuscleRank(result),
      tierIndex: result.status === "evaluated" ? result.tierIndex : null,
    }),
  );
}
