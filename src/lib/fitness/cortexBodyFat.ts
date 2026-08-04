// Pure domain logic — BODY FAT CORTEX : estimation calculée
// INDÉPENDAMMENT à partir de `measurements` (mensurations, Navy) et
// `photo_estimate` (analyse photo) UNIQUEMENT. No React, no Supabase.
//
// RÈGLE ABSOLUE (correctif "Body Fat Cortex indépendant") :
//   Body Fat Cortex = calcul basé UNIQUEMENT sur measurements + photo_estimate.
//   Visbody / bioimpédance externe / DEXA / ancienne saisie manual = 0 %
//   de contribution à ce calcul, quelle que soit leur valeur ou leur date.
// Ces méthodes externes restent visibles dans l'historique (`body_tracking`,
// `BodyHistorySheet`) pour comparaison/tendance — mais ne participent
// JAMAIS à `computeCortexBodyFatEstimate`. Même une DEXA (méthode la plus
// fiable en littérature) n'entre pas dans ce calcul : l'objectif explicite
// de cette feature est une estimation CORTEX indépendante des mesures
// externes, pas la meilleure mesure disponible tous moyens confondus.
//
// Réutilise strictement l'existant : `getBodyFatConfidence`/
// `isValidBodyFatPercent`/`computeLeanMass`/`computeFatMass` (Phase 6A),
// `estimateBodyFatFromMeasurements` (Phase 6B, Navy), `PhotoBodyFatEstimate`
// (Phase 6C). Ne recrée aucun moteur de mesure — combine seulement leurs
// résultats déjà calculés.

import {
  getBodyFatConfidence,
  isValidBodyFatPercent,
  type ConfidenceLevel,
} from "./bodyComposition";

// ---------------------------------------------------------------------
// Constantes centralisées — aucun seuil dispersé/"magic number" (règle
// explicite du correctif).
// ---------------------------------------------------------------------

export const CORTEX_BODY_FAT_THRESHOLDS = {
  /**
   * Demi-largeur (points de %) de la bande de tolérance appliquée AUTOUR
   * du point mensurations pour tester le recouvrement avec la fourchette
   * photo — sert UNIQUEMENT à détecter concordance/désaccord, jamais
   * affichée comme la précision réelle des mensurations. Choix documenté
   * (pas un chiffre arbitraire) : la méthode Navy (mensurations) a une
   * erreur-type publiée de l'ordre de 3-4 points de %BF dans la
   * littérature (Hodgdon & Beckett 1984) — on retient ici une valeur
   * délibérément plus PRUDENTE (2.0, donc plus stricte que l'erreur-type
   * publiée) pour ne pas déclarer une "concordance" trop facilement.
   */
  MEASUREMENTS_CONSENSUS_TOLERANCE_PERCENT: 2.0,
  /**
   * Écart temporel (jours) au-delà duquel deux méthodes Cortex par
   * ailleurs concordantes voient leur confiance réduite par prudence —
   * une mensuration d'il y a 89 jours croisée avec une photo d'aujourd'hui
   * reste utilisée (toutes deux dans `BODY_COMPOSITION_MAX_AGE_DAYS`,
   * voir `bodyCompositionForNutrition.ts`), mais l'écart entre les deux
   * dates de mesure est lui-même un signal de prudence distinct.
   */
  STALE_CROSS_METHOD_GAP_DAYS: 30,
  /** Pas d'arrondi d'affichage — même convention que `bodyFatPhotoEstimate.ts` (0,5 point, jamais une fausse précision). */
  DISPLAY_ROUNDING_STEP: 0.5,
} as const;

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function roundDisplay(value: number): number {
  return roundToStep(value, CORTEX_BODY_FAT_THRESHOLDS.DISPLAY_ROUNDING_STEP);
}

function median3(a: number, b: number, c: number): number {
  return [a, b, c].sort((x, y) => x - y)[1];
}

function daysBetweenIso(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(ta - tb) / 86_400_000;
}

// ---------------------------------------------------------------------
// Entrées — une seule contribution par méthode Cortex (la plus récente
// exploitable, sélectionnée par `selectCortexBodyFatInputs` ci-dessous).
// ---------------------------------------------------------------------

export type CortexBodyFatMethod = "measurements" | "photo_estimate";

export interface CortexBodyFatMeasurementsInput {
  date: string;
  bodyFatPercent: number;
}

export interface CortexBodyFatPhotoInput {
  date: string;
  minPercent: number;
  maxPercent: number;
  referencePercent: number;
}

export interface CortexBodyFatEstimate {
  /** `null` si `methodCount === 0` — jamais une valeur fabriquée. */
  referencePercent: number | null;
  minPercent: number | null;
  maxPercent: number | null;
  /** `null` si `methodCount === 0`. Jamais `"high"` — voir doctrine en tête de fichier : ce n'est jamais présenté comme une certitude médicale. */
  confidence: ConfidenceLevel | null;
  methodsUsed: CortexBodyFatMethod[];
  methodCount: number;
  /** `true` uniquement quand les deux méthodes sont présentes ET ne se recouvrent pas (voir tolérance ci-dessus). */
  disagreement: boolean;
  /** `true` dès qu'au moins une méthode Cortex est disponible — peut alimenter l'affichage/la recommandation manuelle. */
  usableForRecommendation: boolean;
  /** `true` uniquement si `confidence !== "low"` — jamais sur une seule photo, jamais en désaccord (§9/§18 du correctif). */
  usableForAutomaticAdjustment: boolean;
  reason: string;
}

/**
 * Combine les estimations `measurements`/`photo_estimate` les plus
 * récentes en UNE estimation Cortex indépendante. Fonction pure et
 * déterministe — jamais de moyenne naïve des points médians (§7 du
 * correctif) : la photo apporte une FOURCHETTE d'incertitude, les
 * mensurations un point déterministe ; la méthode croise les deux via une
 * zone de recouvrement (concordance) ou un élargissement explicite
 * (désaccord), jamais un coefficient arbitraire.
 */
export function computeCortexBodyFatEstimate(input: {
  measurements: CortexBodyFatMeasurementsInput | null;
  photo: CortexBodyFatPhotoInput | null;
}): CortexBodyFatEstimate {
  const { measurements, photo } = input;

  if (!measurements && !photo) {
    return {
      referencePercent: null,
      minPercent: null,
      maxPercent: null,
      confidence: null,
      methodsUsed: [],
      methodCount: 0,
      disagreement: false,
      usableForRecommendation: false,
      usableForAutomaticAdjustment: false,
      reason:
        "Aucune estimation Cortex disponible — ajoute une estimation par mensurations ou par photos.",
    };
  }

  if (measurements && !photo) {
    const confidence = getBodyFatConfidence("measurements");
    return {
      referencePercent: measurements.bodyFatPercent,
      minPercent: measurements.bodyFatPercent,
      maxPercent: measurements.bodyFatPercent,
      confidence,
      methodsUsed: ["measurements"],
      methodCount: 1,
      disagreement: false,
      usableForRecommendation: true,
      usableForAutomaticAdjustment: confidence !== "low",
      reason:
        "Estimation basée uniquement sur tes mensurations — ajoute une estimation par photos pour affiner la fourchette Cortex.",
    };
  }

  if (photo && !measurements) {
    const confidence = getBodyFatConfidence("photo_estimate");
    return {
      referencePercent: photo.referencePercent,
      minPercent: photo.minPercent,
      maxPercent: photo.maxPercent,
      confidence,
      methodsUsed: ["photo_estimate"],
      methodCount: 1,
      disagreement: false,
      usableForRecommendation: true,
      usableForAutomaticAdjustment: confidence !== "low",
      reason:
        "Estimation basée uniquement sur une analyse photo — indicative, ajoute une estimation par mensurations pour la renforcer.",
    };
  }

  // Les deux méthodes sont présentes — croisement déterministe.
  const m = measurements!.bodyFatPercent;
  const photoRange = photo!;
  const tolerance = CORTEX_BODY_FAT_THRESHOLDS.MEASUREMENTS_CONSENSUS_TOLERANCE_PERCENT;
  const mLow = m - tolerance;
  const mHigh = m + tolerance;

  const overlapLow = Math.max(mLow, photoRange.minPercent);
  const overlapHigh = Math.min(mHigh, photoRange.maxPercent);
  const disagreement = overlapLow > overlapHigh;

  const gapDays = daysBetweenIso(measurements!.date, photoRange.date);
  const stale = gapDays > CORTEX_BODY_FAT_THRESHOLDS.STALE_CROSS_METHOD_GAP_DAYS;

  let minPercent: number;
  let maxPercent: number;
  let referencePercent: number;
  let confidence: ConfidenceLevel;
  let reason: string;

  if (!disagreement) {
    // Concordance — zone de recouvrement entre la bande de tolérance des
    // mensurations et la fourchette photo, jamais une moyenne naïve.
    minPercent = roundDisplay(overlapLow);
    maxPercent = roundDisplay(overlapHigh);
    referencePercent = roundDisplay((overlapLow + overlapHigh) / 2);
    confidence = stale ? "low" : "medium";
    reason = stale
      ? `Mensurations (${m} %) et photos (${photoRange.minPercent}–${photoRange.maxPercent} %) concordent, mais les deux mesures sont éloignées dans le temps (${Math.round(gapDays)} j) — confiance réduite par prudence.`
      : `Mensurations (${m} %) et photos (${photoRange.minPercent}–${photoRange.maxPercent} %) concordent — estimation renforcée par les deux méthodes.`;
  } else {
    // Désaccord — élargissement explicite, jamais masqué par une moyenne.
    minPercent = roundDisplay(Math.min(mLow, photoRange.minPercent));
    maxPercent = roundDisplay(Math.max(mHigh, photoRange.maxPercent));
    referencePercent = roundDisplay(median3(m, photoRange.minPercent, photoRange.maxPercent));
    confidence = "low";
    reason = `Les estimations mensurations (${m} %) et photos (${photoRange.minPercent}–${photoRange.maxPercent} %) diffèrent sensiblement — la fourchette Cortex est élargie et l'automatisation nutritionnelle reste désactivée.`;
  }

  return {
    referencePercent,
    minPercent,
    maxPercent,
    confidence,
    methodsUsed: ["measurements", "photo_estimate"],
    methodCount: 2,
    disagreement,
    usableForRecommendation: true,
    usableForAutomaticAdjustment: confidence !== "low",
    reason,
  };
}

// ---------------------------------------------------------------------
// Sélection des entrées — une seule contribution par méthode : la plus
// RÉCENTE exploitable (§13 du correctif, jamais un vote de 10 anciennes
// mensurations contre une photo récente). `candidates` DOIT être trié du
// plus récent au plus ancien (même convention que `useBodyMeasurements`).
// Visbody/manual/dexa/bioimpedance sont IGNORÉS ICI PAR CONSTRUCTION — le
// filtre `method === "measurements" | "photo_estimate"` est la garantie
// structurelle que ces méthodes ne peuvent jamais entrer dans le calcul.
// ---------------------------------------------------------------------

export interface CortexBodyFatCandidate {
  date: string;
  method: string | null;
  bodyFatPercent: number | null;
  bodyFatMinPercent: number | null;
  bodyFatMaxPercent: number | null;
}

export interface CortexBodyFatInputs {
  measurements: CortexBodyFatMeasurementsInput | null;
  photo: CortexBodyFatPhotoInput | null;
}

export function selectCortexBodyFatInputs(
  candidates: readonly CortexBodyFatCandidate[],
  todayIso: string,
  maxAgeDays: number,
): CortexBodyFatInputs {
  const withinWindow = (date: string) => daysBetweenIso(date, todayIso) <= maxAgeDays;

  const measurementsRow = candidates.find(
    (c) =>
      c.method === "measurements" &&
      isValidBodyFatPercent(c.bodyFatPercent) &&
      withinWindow(c.date),
  );
  const photoRow = candidates.find(
    (c) =>
      c.method === "photo_estimate" &&
      isValidBodyFatPercent(c.bodyFatPercent) &&
      isValidBodyFatPercent(c.bodyFatMinPercent) &&
      isValidBodyFatPercent(c.bodyFatMaxPercent) &&
      withinWindow(c.date),
  );

  return {
    measurements: measurementsRow
      ? { date: measurementsRow.date, bodyFatPercent: measurementsRow.bodyFatPercent as number }
      : null,
    photo: photoRow
      ? {
          date: photoRow.date,
          minPercent: photoRow.bodyFatMinPercent as number,
          maxPercent: photoRow.bodyFatMaxPercent as number,
          referencePercent: photoRow.bodyFatPercent as number,
        }
      : null,
  };
}

/** Libellé lisible des sources Cortex contribuant à l'estimation — jamais une méthode externe. */
export function describeCortexBodyFatSources(methodsUsed: readonly CortexBodyFatMethod[]): string {
  if (methodsUsed.length === 0) return "Aucune";
  if (methodsUsed.length === 2) return "Mensurations + Photos";
  return methodsUsed[0] === "measurements" ? "Mensurations" : "Photos";
}
