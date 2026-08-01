// Pure domain logic for l'ESTIMATION du Body Fat à partir des
// mensurations — Phase 6B de la refonte Santé nutritionnelle. No React,
// no Supabase, no UI tokens.
//
// Formule retenue : U.S. Navy Circumference Method (Hodgdon, J.A., &
// Beckett, M.B., 1984, Naval Health Research Center, San Diego —
// "Prediction of Percent Body Fat for U.S. Navy Men from Body
// Circumferences and Height", Report No. 84-11 ; et le rapport équivalent
// pour les femmes, Report No. 84-29). Formule codifiée depuis dans les
// standards d'évaluation de composition corporelle de l'armée américaine
// (AR 600-9). Choisie plutôt qu'une formule de blog fitness : origine
// publiée, largement recoupée, coefficients stables et documentés.
//
// ⚠️ UNITÉS : la formule originale est calibrée en POUCES (inches) — les
// coefficients (0.19077, 0.15456, etc.) ne sont PAS valables tels quels
// avec des centimètres (log10 d'une grandeur change de valeur selon
// l'unité). Cortex travaille en cm partout ailleurs (voir `poids`/
// `taille` dans tout le reste de la codebase) — cette fonction convertit
// donc explicitement cm → inches en interne (1 in = 2.54 cm) AVANT
// d'appliquer les coefficients originaux, jamais l'inverse.
//
// PRINCIPE (§ brief Phase 6B) : ceci est une ESTIMATION, pas une mesure
// exacte — jamais une précision artificielle (arrondie à 1 décimale, pas
// "15.438271 %"). La méthode reste toujours visible (`method:
// "measurements"`, `formula: "navy_v1"`), avec la confiance du système
// centralisé Phase 6A (`lib/fitness/bodyComposition.ts`) — jamais un
// second système de confiance dupliqué.

import { isBiologicalSex, type BiologicalSex } from "./metabolism";
import {
  getBodyFatConfidence,
  isValidBodyFatPercent,
  type ConfidenceLevel,
} from "./bodyComposition";

export { isBiologicalSex };
export type { BiologicalSex };

/**
 * Identifiant STABLE de la formule utilisée — distinct de `body_fat_
 * method` ("measurements", la CATÉGORIE). Permet de savoir un jour
 * précisément comment une estimation historique a été produite si une
 * seconde formule est ajoutée plus tard (§8 du brief).
 */
export type BodyFatFormula = "navy_v1";

const INCHES_PER_CM = 1 / 2.54;

// ---------------------------------------------------------------------
// Validation — bornes techniques larges, jamais un diagnostic médical.
// ---------------------------------------------------------------------

function isValidPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Mensurations requises selon le sexe (§4 du brief) — jamais demander une donnée inutile au calcul. */
export function requiredMeasurementsForSex(
  sex: BiologicalSex,
): Array<"waistCm" | "neckCm" | "hipCm"> {
  return sex === "femme" ? ["waistCm", "neckCm", "hipCm"] : ["waistCm", "neckCm"];
}

export interface NavyMeasurementsInput {
  sex: BiologicalSex | null;
  heightCm: number | null;
  waistCm: number | null;
  neckCm: number | null;
  /** Requis uniquement pour `sex === "femme"` — ignoré pour "homme". */
  hipCm: number | null;
}

export type BodyFatEstimationStatus = "ok" | "missing_data" | "invalid_measurements";

export interface BodyFatEstimationResult {
  status: BodyFatEstimationStatus;
  /** Arrondi à 1 décimale — `null` si `status !== "ok"`, jamais NaN. */
  bodyFatPercent: number | null;
  method: "measurements";
  formula: BodyFatFormula;
  /** Confiance du mapping centralisé Phase 6A (`BODY_FAT_METHOD_CONFIDENCE.measurements`) — jamais un second système. */
  confidence: ConfidenceLevel | null;
  inputs: NavyMeasurementsInput;
  /** Explications lisibles (donnée manquante, géométrie invalide, hors plage plausible) — jamais un simple NaN silencieux. */
  warnings: string[];
}

function result(
  status: BodyFatEstimationStatus,
  bodyFatPercent: number | null,
  inputs: NavyMeasurementsInput,
  warnings: string[],
): BodyFatEstimationResult {
  return {
    status,
    bodyFatPercent,
    method: "measurements",
    formula: "navy_v1",
    confidence: status === "ok" ? getBodyFatConfidence("measurements") : null,
    inputs,
    warnings,
  };
}

/**
 * Estimation du Body Fat via la méthode U.S. Navy (mensurations). Fonction
 * pure et déterministe — ne modifie rien, ne connaît pas Supabase.
 */
export function estimateBodyFatFromMeasurements(
  input: NavyMeasurementsInput,
): BodyFatEstimationResult {
  const warnings: string[] = [];

  if (input.sex == null) {
    return result("missing_data", null, input, ["Sexe biologique manquant."]);
  }
  const sex = input.sex;

  const missing: string[] = [];
  if (!isValidPositiveFinite(input.heightCm)) missing.push("Taille");
  if (!isValidPositiveFinite(input.waistCm)) missing.push("Tour de taille");
  if (!isValidPositiveFinite(input.neckCm)) missing.push("Tour de cou");
  if (sex === "femme" && !isValidPositiveFinite(input.hipCm)) missing.push("Tour de hanches");
  if (missing.length > 0) {
    return result("missing_data", null, input, [`Données manquantes : ${missing.join(", ")}.`]);
  }

  const heightCm = input.heightCm as number;
  const waistCm = input.waistCm as number;
  const neckCm = input.neckCm as number;
  const hipCm = input.hipCm; // peut être null pour "homme", validé ci-dessus pour "femme"

  // §10 du brief : la formule utilise log10 d'une DIFFÉRENCE — cette
  // différence doit être strictement positive, sinon log10 est indéfini
  // (négatif ou zéro). Retourner un statut explicite, jamais NaN.
  const geometryHomme = waistCm - neckCm;
  const geometryFemme = sex === "femme" ? waistCm + (hipCm as number) - neckCm : null;
  if (sex === "homme" && geometryHomme <= 0) {
    return result("invalid_measurements", null, input, [
      "Le tour de taille doit être strictement supérieur au tour de cou pour cette formule.",
    ]);
  }
  if (sex === "femme" && geometryFemme != null && geometryFemme <= 0) {
    return result("invalid_measurements", null, input, [
      "La somme tour de taille + tour de hanches doit être strictement supérieure au tour de cou pour cette formule.",
    ]);
  }

  // Conversion cm → inches — JAMAIS appliquer les coefficients ci-dessous à des centimètres bruts.
  const heightIn = heightCm * INCHES_PER_CM;
  const waistIn = waistCm * INCHES_PER_CM;
  const neckIn = neckCm * INCHES_PER_CM;
  const hipIn = hipCm != null ? hipCm * INCHES_PER_CM : null;

  let bodyFatPercent: number;
  if (sex === "homme") {
    const denom = 1.0324 - 0.19077 * Math.log10(waistIn - neckIn) + 0.15456 * Math.log10(heightIn);
    bodyFatPercent = 495 / denom - 450;
  } else {
    const denom =
      1.29579 -
      0.35004 * Math.log10(waistIn + (hipIn as number) - neckIn) +
      0.221 * Math.log10(heightIn);
    bodyFatPercent = 495 / denom - 450;
  }

  if (!Number.isFinite(bodyFatPercent)) {
    return result("invalid_measurements", null, input, [
      "Calcul impossible avec ces mensurations — vérifie les valeurs saisies.",
    ]);
  }

  // §12 du brief : arrondi centralisé, jamais de précision artificielle.
  const rounded = Math.round(bodyFatPercent * 10) / 10;

  if (!isValidBodyFatPercent(rounded)) {
    return result("invalid_measurements", null, input, [
      `Résultat hors de la plage plausible (${rounded} %) — vérifie tes mensurations.`,
    ]);
  }

  return result("ok", rounded, input, warnings);
}
