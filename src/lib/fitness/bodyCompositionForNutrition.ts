// Pure domain logic — décide si le BODY FAT CORTEX (voir `cortexBodyFat.ts`)
// est exploitable pour ENRICHIR la recommandation nutritionnelle (Phase 7),
// et calcule la cible protéique dérivée de la masse maigre quand c'est le
// cas. No React, no Supabase.
//
// Doctrine (brief Phase 7, section OBJECTIF ; correctif "Body Fat Cortex
// indépendant") : Body Fat n'est JAMAIS une dépendance obligatoire du
// moteur nutritionnel — cette fonction ne fait qu'ENRICHIR
// `macroStrategy.ts` quand une estimation Cortex (mensurations et/ou
// photos UNIQUEMENT — jamais Visbody/manual/dexa/bioimpédance externe,
// voir `cortexBodyFat.ts`) suffisamment récente existe. En son absence,
// `selectBodyCompositionForNutrition` renvoie `null` et l'appelant retombe
// sur le pipeline poids corporel Phase 5 existant, sans erreur ni blocage
// utilisateur (§30 du brief Phase 7 ; §17 du correctif).
//
// §14 du correctif : la masse grasse/maigre ACTUELLE utilise le poids
// ACTUEL (`currentWeightKg`, fourni par l'appelant) — jamais le poids
// historique attaché à la mesure Body Fat elle-même. Ne duplique jamais
// `computeLeanMass`/`getBodyFatConfidence` (Phase 6A) ni la logique de
// combinaison measurements/photo (`cortexBodyFat.ts`) — les réutilise
// strictement.

import { computeLeanMass, type BodyFatMethod, type ConfidenceLevel } from "./bodyComposition";
import {
  computeCortexBodyFatEstimate,
  selectCortexBodyFatInputs,
  type CortexBodyFatCandidate,
  type CortexBodyFatMethod,
} from "./cortexBodyFat";
import { MACRO_STRATEGY_COEFFICIENTS } from "./macroStrategy";
import type { CalorieStrategyGoal } from "./calorieStrategy";

// ---------------------------------------------------------------------
// Politique de récence (§4 du brief Phase 7) — inchangée, auditée et
// conservée par le correctif "Body Fat Cortex indépendant" (§13).
// ---------------------------------------------------------------------

/**
 * Au-delà de ce nombre de jours, une mesure Cortex (mensurations ou photo)
 * n'est plus combinée avec le poids actuel pour en déduire une masse
 * maigre exploitable pour la nutrition — règle produit PRUDENTE (pas une
 * certitude scientifique), centralisée ici pour rester ajustable sans
 * toucher au reste du moteur. ~3 mois : au-delà, l'entraînement a pu
 * suffisamment faire évoluer la composition réelle pour qu'associer une
 * ancienne mesure au poids d'aujourd'hui produise une masse maigre
 * fictive plutôt qu'une estimation utile.
 */
export const BODY_COMPOSITION_MAX_AGE_DAYS = 90;

// ---------------------------------------------------------------------
// Sélection de la composition corporelle exploitable
// ---------------------------------------------------------------------

/** Alias conservé pour compatibilité des imports existants — même forme que `CortexBodyFatCandidate`. */
export type BodyCompositionCandidate = CortexBodyFatCandidate;

export interface SelectedBodyComposition {
  /** Date la plus récente parmi les méthodes Cortex ayant contribué (mensurations et/ou photo). */
  date: string;
  /** Poids ACTUEL (§14 du correctif) — jamais le poids historique de la mesure Body Fat. */
  weightKg: number;
  bodyFatPercent: number;
  bodyFatMinPercent: number;
  bodyFatMaxPercent: number;
  /** Calculée avec le poids ACTUEL + le Body Fat Cortex — jamais un poids historique (§14/§18 du correctif). */
  leanMassKg: number;
  /** `null` quand mensurations ET photos contribuent toutes les deux — voir `methodsUsed` pour le détail complet. */
  method: BodyFatMethod | null;
  methodsUsed: CortexBodyFatMethod[];
  confidence: ConfidenceLevel;
  /** `true` si `bodyFatMinPercent !== bodyFatMaxPercent` (photo seule, ou désaccord mensurations/photos). */
  isRange: boolean;
  disagreement: boolean;
  /**
   * §21/§22 du brief Phase 7, reconduit par le correctif : une donnée peut
   * être assez intéressante pour INFORMER l'utilisateur sans être assez
   * fiable pour modifier ses macros automatiquement. `false` dès que la
   * confiance Cortex tombe à "low" (photo seule, désaccord mensurations/
   * photos, ou mesures Cortex trop éloignées dans le temps) — jamais de
   * déclenchement automatique sur une simple estimation indicative.
   */
  usableForAutomaticAdjustment: boolean;
}

function isValidPositiveWeight(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Construit le BODY FAT CORTEX exploitable pour la nutrition à partir de
 * l'historique `body_tracking` (trié du plus récent au plus ancien, même
 * convention que `useBodyMeasurements`) et du poids ACTUEL — ou `null` si
 * aucune estimation Cortex n'est disponible (repli poids corporel garanti
 * côté appelant, §13/§30 du brief Phase 7 ; §17 du correctif). Ne
 * considère QUE `measurements`/`photo_estimate` (voir `cortexBodyFat.ts`)
 * — Visbody/manual/dexa/bioimpédance externe ont une contribution
 * STRUCTURELLEMENT nulle à ce résultat, quelle que soit leur valeur ou
 * leur date.
 */
export function selectBodyCompositionForNutrition(
  candidates: BodyCompositionCandidate[],
  todayIso: string,
  currentWeightKg: number | null,
): SelectedBodyComposition | null {
  if (!isValidPositiveWeight(currentWeightKg)) return null;

  const inputs = selectCortexBodyFatInputs(candidates, todayIso, BODY_COMPOSITION_MAX_AGE_DAYS);
  const estimate = computeCortexBodyFatEstimate(inputs);
  if (
    estimate.methodCount === 0 ||
    estimate.referencePercent == null ||
    estimate.confidence == null
  ) {
    return null;
  }

  const leanMassKg = computeLeanMass(currentWeightKg, estimate.referencePercent);
  if (leanMassKg == null) return null;

  const dates = [inputs.measurements?.date, inputs.photo?.date].filter(
    (d): d is string => d != null,
  );
  const date = dates.sort().at(-1) as string;

  return {
    date,
    weightKg: currentWeightKg,
    bodyFatPercent: estimate.referencePercent,
    bodyFatMinPercent: estimate.minPercent as number,
    bodyFatMaxPercent: estimate.maxPercent as number,
    leanMassKg,
    method: estimate.methodsUsed.length === 1 ? estimate.methodsUsed[0] : null,
    methodsUsed: estimate.methodsUsed,
    confidence: estimate.confidence,
    isRange: estimate.minPercent !== estimate.maxPercent,
    disagreement: estimate.disagreement,
    usableForAutomaticAdjustment: estimate.usableForAutomaticAdjustment,
  };
}

// ---------------------------------------------------------------------
// Cible protéique dérivée de la masse maigre (§7/§9/§10/§11 du brief)
// ---------------------------------------------------------------------

/**
 * g de protéines / kg de MASSE MAIGRE / jour, par objectif — PAS une
 * conversion naïve des coefficients g/kg de POIDS TOTAL de
 * `macroStrategy.ts` (§10 du brief : « ce ne sont pas nécessairement des
 * prescriptions équivalentes »). Calibrés pour qu'à un taux de graisse
 * corporelle « moyen » (~20 %, masse maigre ≈ 80 % du poids), l'apport
 * protéique en grammes reste dans le même ordre de grandeur que le
 * pipeline poids-total actuel (`fat_loss` 2.2×poids ≈ 2.75×masse maigre à
 * 20 % BF — nous retenons 2.6, sous cette équivalence, donc plus
 * conservateur, jamais plus agressif) — avec une marge qui reste dans la
 * fourchette usuelle de la littérature en nutrition sportive pour la
 * masse maigre (ISSN position stand, Jäger et al. 2017 : jusqu'à
 * ~2.3-3.1 g/kg de masse maigre en déficit pour des populations
 * entraînées). Volontairement arrondis — pas une fausse précision (§15).
 */
export const LEAN_MASS_PROTEIN_G_PER_KG = {
  fat_loss: 2.6,
  maintenance: 2.0,
  muscle_gain: 2.4,
} satisfies Record<CalorieStrategyGoal, number>;

/**
 * Cible protéique brute (non arrondie, non plafonnée par l'enveloppe
 * calorique — `computeMacroStrategy` s'en charge) dérivée de la masse
 * maigre. Réutilise le même plafond de sécurité que le moteur poids
 * total (`BODYWEIGHT_CAP_KG`) — la masse maigre étant toujours inférieure
 * au poids total, elle ne devrait jamais l'atteindre en pratique, mais le
 * garde-fou reste appliqué explicitement plutôt que supposé.
 */
export function computeLeanMassProteinTargetG(
  goal: CalorieStrategyGoal,
  leanMassKg: number,
): number | null {
  if (!Number.isFinite(leanMassKg) || leanMassKg <= 0) return null;
  const cappedLeanMassKg = Math.min(leanMassKg, MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG);
  return cappedLeanMassKg * LEAN_MASS_PROTEIN_G_PER_KG[goal];
}
