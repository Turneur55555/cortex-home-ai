// ============================================================
// Puissance Cortex — Option 1, verrouillée le 29/08/2026 après validation
// mathématique complète (recherche exhaustive ~305 000 configurations +
// preuve analytique — voir le rapport de validation F3/Option 1).
//
// Formule :
//   A = moyenne arithmétique pondérée des rangs musculaires évalués
//   G = moyenne géométrique pondérée des rangs musculaires évalués
//   Puissance = max( round(2G − A), min(rangs évalués) )
//
// Propriétés GARANTIES ANALYTIQUEMENT pour toute configuration (pas
// seulement testées) :
//   - min(rangs évalués) <= Puissance <= max(rangs évalués) <= 29
//   - Puissance = X si tous les rangs évalués valent X
// La borne inférieure explicite (`max(F3, min)`) est la correction
// apportée à la formule F3 nue (`round(2G − A)`), qui pouvait descendre
// sous le minimum dans des configurations à forte dispersion (démontré :
// pire cas trouvé −5,81 tiers sous le minimum). Ce n'est pas un clamp
// ajouté après coup pour masquer un cas limite : c'est mathématiquement
// équivalent à plafonner la pénalité de dispersion à la marge disponible
// entre G et le minimum — une décision de conception explicite, validée.
//
// Poids musculaires : HYPOTHÈSE DE CALIBRATION CORTEX (raisonnement
// anatomique sur la masse musculaire relative du buste), PAS une mesure
// scientifique — à challenger séparément si une source anthropométrique
// fiable devient disponible. Ne pas les modifier sans revalider tout ce
// module (les tests de non-régression du rapport en dépendent).
// ============================================================

export type BusteMuscleGroup =
  | "dos"
  | "pectoraux"
  | "epaules"
  | "abdos"
  | "biceps"
  | "triceps"
  | "trapeze"
  | "avant-bras";

export const BUSTE_MUSCLE_WEIGHTS: Record<BusteMuscleGroup, number> = {
  dos: 0.2,
  pectoraux: 0.15,
  epaules: 0.15,
  abdos: 0.15,
  biceps: 0.1,
  triceps: 0.1,
  trapeze: 0.1,
  "avant-bras": 0.05,
};

export const BUSTE_MUSCLES = Object.keys(BUSTE_MUSCLE_WEIGHTS) as BusteMuscleGroup[];

export const CORTEX_POWER_COMPLETENESS_MIN = 5; // sur 8 groupes musculaires

export interface CortexPowerMuscleInput {
  muscle: BusteMuscleGroup;
  /** Rang musculaire, 0-29, ou `null` si non évalué (voir `muscleRank.ts`). */
  tierIndex: number | null;
}

export type CortexPowerResult =
  | { status: "partial"; evaluatedCount: number }
  | { status: "complete"; tierIndex: number; evaluatedCount: number };

export function computeCortexPower(inputs: CortexPowerMuscleInput[]): CortexPowerResult {
  const evaluated = inputs.filter(
    (i): i is { muscle: BusteMuscleGroup; tierIndex: number } => i.tierIndex != null,
  );

  if (evaluated.length < CORTEX_POWER_COMPLETENESS_MIN) {
    return { status: "partial", evaluatedCount: evaluated.length };
  }

  const weights = evaluated.map((e) => BUSTE_MUSCLE_WEIGHTS[e.muscle]);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const A = evaluated.reduce((sum, e, i) => sum + e.tierIndex * (weights[i] / totalWeight), 0);
  const logSum = evaluated.reduce(
    (sum, e, i) => sum + (weights[i] / totalWeight) * Math.log(e.tierIndex + 1),
    0,
  );
  const G = Math.exp(logSum) - 1;
  const F3 = 2 * G - A;

  const minTier = Math.min(...evaluated.map((e) => e.tierIndex));
  const power = Math.max(Math.round(F3), minTier);
  // Garde-fou défensif (robustesse flottante) : la preuve mathématique
  // garantit déjà power ∈ [minTier, maxTier] ⊆ [0, 29] pour tout minTier/
  // maxTier valides — ce clamp ne change jamais le résultat en pratique.
  const tierIndex = Math.max(0, Math.min(29, power));

  return { status: "complete", tierIndex, evaluatedCount: evaluated.length };
}
