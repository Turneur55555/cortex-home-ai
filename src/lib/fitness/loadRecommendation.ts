/**
 * Recommandation de charge (domaine pur, zéro React, sans RPE).
 *
 * Principe simple et honnête : la référence est la dernière performance
 * réalisée sur l'exercice. La charge n'est modulée qu'à la baisse, lorsque
 * le muscle principal n'est pas encore récupéré (fraction 0 → -15 %, 1 → 0 %).
 */

export interface LastPerformance {
  weight: number | null | undefined;
  reps: number | null | undefined;
}

export interface LoadRecommendationInput {
  last: LastPerformance;
  /** Fraction de récupération du muscle le moins récupéré (0 = épuisé, 1 = frais). */
  recoveryFraction?: number | null;
  /** Incrément de charge disponible en salle (par défaut 2,5 kg). */
  increment?: number;
}

export interface LoadRecommendation {
  weight: number | null;
  deltaPct: number | null;
  recoveryLimited: boolean;
  reason: string;
}

const isPos = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function recommendLoad(input: LoadRecommendationInput): LoadRecommendation {
  const { last } = input;
  const increment = isPos(input.increment) ? (input.increment as number) : 2.5;

  if (!isPos(last.weight) || !isPos(last.reps)) {
    return {
      weight: null,
      deltaPct: null,
      recoveryLimited: false,
      reason: "Données insuffisantes : aucune série de référence valide.",
    };
  }

  let target = last.weight as number;
  let recoveryLimited = false;
  const rec = input.recoveryFraction;
  if (rec != null && Number.isFinite(rec)) {
    const f = clamp(rec, 0, 1);
    const factor = 0.85 + 0.15 * f;
    if (factor < 0.999) {
      target *= factor;
      recoveryLimited = true;
    }
  }

  const weight = Math.max(increment, Math.round(target / increment) * increment);
  const deltaPct =
    Math.round(((weight - (last.weight as number)) / (last.weight as number)) * 1000) / 10;

  const reason = recoveryLimited
    ? "Charge réduite : muscle principal encore en récupération."
    : "Charge de la dernière séance maintenue.";

  return { weight, deltaPct, recoveryLimited, reason };
}
