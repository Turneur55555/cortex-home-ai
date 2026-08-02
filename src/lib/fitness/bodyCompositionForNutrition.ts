// Pure domain logic — décide si une donnée de composition corporelle
// (Body Fat / masse maigre) est exploitable pour ENRICHIR la
// recommandation nutritionnelle (Phase 7), et calcule la cible protéique
// dérivée de la masse maigre quand c'est le cas. No React, no Supabase.
//
// Doctrine (brief Phase 7, section OBJECTIF) : Body Fat n'est JAMAIS une
// dépendance obligatoire du moteur nutritionnel — cette fonction ne fait
// qu'ENRICHIR `macroStrategy.ts` quand une mesure suffisamment récente et
// fiable existe. En son absence, `selectBodyCompositionForNutrition`
// renvoie `null` et l'appelant retombe sur le pipeline poids corporel
// Phase 5 existant, sans erreur ni blocage utilisateur (§30 du brief).
//
// Ne duplique jamais `computeLeanMass`/`getBodyFatConfidence` de
// `bodyComposition.ts` (Phase 6A) — les réutilise strictement.

import {
  computeLeanMass,
  getBodyFatConfidence,
  isKnownBodyFatMethod,
  isValidBodyFatPercent,
  type BodyFatMethod,
  type ConfidenceLevel,
} from "./bodyComposition";
import { MACRO_STRATEGY_COEFFICIENTS } from "./macroStrategy";
import type { CalorieStrategyGoal } from "./calorieStrategy";

// ---------------------------------------------------------------------
// Politique de récence (§4 du brief Phase 7)
// ---------------------------------------------------------------------

/**
 * Au-delà de ce nombre de jours, une mesure de composition corporelle
 * n'est plus combinée avec le poids actuel pour en déduire une masse
 * maigre exploitable pour la nutrition — règle produit PRUDENTE (pas une
 * certitude scientifique), centralisée ici pour rester ajustable sans
 * toucher au reste du moteur. ~3 mois : au-delà, l'entraînement a pu
 * suffisamment faire évoluer la composition réelle pour qu'associer une
 * ancienne mesure au poids d'aujourd'hui produise une masse maigre
 * fictive plutôt qu'une estimation utile.
 */
export const BODY_COMPOSITION_MAX_AGE_DAYS = 90;

function daysBetween(isoDateA: string, isoDateB: string): number {
  const a = new Date(`${isoDateA}T00:00:00Z`).getTime();
  const b = new Date(`${isoDateB}T00:00:00Z`).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

// ---------------------------------------------------------------------
// Sélection de la composition corporelle exploitable
// ---------------------------------------------------------------------

export interface BodyCompositionCandidate {
  /** Date ISO (`YYYY-MM-DD`) de la ligne `body_tracking`. */
  date: string;
  /** Poids sur la MÊME ligne — jamais combiné à un BF d'une autre date (§5 du brief). */
  weightKg: number | null;
  /** Point de référence (midpoint pour une fourchette photo) — jamais min/max séparément ici. */
  bodyFatPercent: number | null;
  method: string | null;
}

export interface SelectedBodyComposition {
  date: string;
  weightKg: number;
  bodyFatPercent: number;
  leanMassKg: number;
  method: BodyFatMethod;
  confidence: ConfidenceLevel;
  /** `true` si la méthode d'origine est une estimation par fourchette (photo). */
  isRange: boolean;
  /**
   * §21/§22 du brief : une donnée peut être assez intéressante pour
   * INFORMER l'utilisateur sans être assez fiable pour modifier ses
   * macros automatiquement. `false` pour toute méthode de confiance
   * "low" (`photo_estimate`, `manual`) — jamais de déclenchement
   * automatique sur une simple estimation indicative ou une saisie dont
   * l'origine réelle est inconnue de Cortex.
   */
  usableForAutomaticAdjustment: boolean;
}

/**
 * Sélectionne, parmi un historique `body_tracking` trié du plus récent
 * au plus ancien (ordre déjà produit par `useBodyMeasurements`), la
 * première mesure réellement exploitable pour enrichir la recommandation
 * nutritionnelle — ou `null` si aucune ne l'est (repli poids corporel
 * garanti côté appelant, §13/§30 du brief).
 *
 * Exploitable = méthode connue + BF valide (1-70 %) + poids ET BF sur la
 * MÊME ligne + mesure dans la fenêtre de récence (§4). Parmi les
 * candidats exploitables, le PLUS RÉCENT l'emporte — Cortex ne suppose
 * jamais de hiérarchie arbitraire de méthode du type « DEXA > mensurations
 * > bioimpédance > photo » (§3 du brief) : une DEXA vieille de 89 jours
 * reste préférée à une estimation photo d'hier tant qu'elle est encore
 * dans la fenêtre de récence — choix documenté, pas un oubli.
 */
export function selectBodyCompositionForNutrition(
  candidates: BodyCompositionCandidate[],
  todayIso: string,
): SelectedBodyComposition | null {
  for (const candidate of candidates) {
    if (!isKnownBodyFatMethod(candidate.method)) continue;
    if (!isValidBodyFatPercent(candidate.bodyFatPercent)) continue;
    if (
      typeof candidate.weightKg !== "number" ||
      !Number.isFinite(candidate.weightKg) ||
      candidate.weightKg <= 0
    ) {
      continue;
    }
    if (daysBetween(candidate.date, todayIso) > BODY_COMPOSITION_MAX_AGE_DAYS) continue;

    const leanMassKg = computeLeanMass(candidate.weightKg, candidate.bodyFatPercent);
    if (leanMassKg == null) continue;

    const method = candidate.method as BodyFatMethod;
    const confidence = getBodyFatConfidence(method);
    return {
      date: candidate.date,
      weightKg: candidate.weightKg,
      bodyFatPercent: candidate.bodyFatPercent,
      leanMassKg,
      method,
      confidence,
      isRange: method === "photo_estimate",
      usableForAutomaticAdjustment: confidence !== "low",
    };
  }
  return null;
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
