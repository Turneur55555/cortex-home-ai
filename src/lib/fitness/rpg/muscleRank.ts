// ============================================================
// Rang musculaire — Méthode C (hybride), validée le 29/08/2026.
//
// Agrège les rangs d'exercices (0-29, moteur `rank/engine.ts`, inchangé)
// en un rang par groupe musculaire. Voir le rapport de calibration RPG V2
// (Phase 2 finale) pour la justification de chaque garde-fou :
//   - couverture minimale : moins de 2 exercices évalués → "non évalué",
//     jamais un rang fabriqué à partir d'un seul point de donnée (c'est le
//     seul des 3 candidats testés qui respecte littéralement la règle
//     « un seul exercice ne doit jamais déterminer seul le rang »).
//   - plafond de poids à 50 % : aucun exercice ne peut peser plus de la
//     moitié du poids total, même s'il est le seul renseigné avec un poids
//     nominal élevé.
//   - moyenne géométrique pondérée : pénalise mécaniquement un profil
//     déséquilibré, sans réglage arbitraire supplémentaire.
//   - plafond relatif (Δ=8) : le résultat ne peut jamais s'éloigner de plus
//     de 8 tiers du 2ᵉ meilleur signal réel (empêche qu'un seul exercice
//     extrême, même après plafonnement du poids, ne fasse dériver le
//     résultat trop loin du reste des données).
//
// Poids par exercice (primaire/secondaire) : AUCUNE donnée de ce type
// n'existe aujourd'hui dans Cortex (`exerciseToMuscles()` ne renvoie qu'une
// liste plate de muscles, sans rôle ni pondération — vérifié en session).
// Le paramètre `weight` est donc optionnel et vaut 1 par défaut pour tout
// exercice contributeur (poids égal) — prêt à recevoir une vraie
// pondération primaire/secondaire le jour où cette donnée existera, sans
// changement de signature.
// ============================================================

export interface MuscleRankExerciseInput {
  /** Identité de l'exercice contributeur (juste pour le débogage/tests). */
  key: string;
  /** Rang de l'exercice, 0-29 (moteur `rank/engine.ts`). */
  tierIndex: number;
  /** Poids nominal du rôle (primaire=1, secondaire=0.4…). 1 par défaut. */
  weight?: number;
}

export type MuscleRankResult =
  | { status: "not_evaluated"; tierIndex: null; contributingCount: number }
  | { status: "evaluated"; tierIndex: number; contributingCount: number };

export const MUSCLE_RANK_MIN_CONTRIBUTING_EXERCISES = 2;
export const MUSCLE_RANK_MAX_SINGLE_WEIGHT_SHARE = 0.5;
export const MUSCLE_RANK_RELATIVE_CAP_DELTA = 8;

export function computeMuscleRank(exercises: MuscleRankExerciseInput[]): MuscleRankResult {
  const valid = exercises.filter(
    (e) => Number.isFinite(e.tierIndex) && e.tierIndex >= 0 && e.tierIndex <= 29,
  );

  if (valid.length < MUSCLE_RANK_MIN_CONTRIBUTING_EXERCISES) {
    return { status: "not_evaluated", tierIndex: null, contributingCount: valid.length };
  }

  const nominalWeights = valid.map((e) => Math.max(0, e.weight ?? 1));
  const totalNominal = nominalWeights.reduce((s, w) => s + w, 0);
  const cap = MUSCLE_RANK_MAX_SINGLE_WEIGHT_SHARE * totalNominal;
  const cappedWeights = nominalWeights.map((w) => Math.min(w, cap));
  const totalCapped = cappedWeights.reduce((s, w) => s + w, 0);

  const logSum = valid.reduce(
    (sum, e, i) => sum + (cappedWeights[i] / totalCapped) * Math.log(e.tierIndex + 1),
    0,
  );
  const geometric = Math.exp(logSum) - 1;

  const sortedTiers = valid.map((e) => e.tierIndex).sort((a, b) => b - a);
  const secondBestTier = sortedTiers[1];
  const relativeCap = secondBestTier + MUSCLE_RANK_RELATIVE_CAP_DELTA;

  const clamped = Math.min(geometric, relativeCap);
  const tierIndex = Math.max(0, Math.min(29, Math.round(clamped)));

  return { status: "evaluated", tierIndex, contributingCount: valid.length };
}
