// Pure domain logic for l'ESTIMATION du Body Fat par PHOTOS — Phase 6C de
// la refonte Santé nutritionnelle. No React, no Supabase, no UI tokens, no
// knowledge of the AI provider's raw response shape.
//
// PRINCIPE FONDAMENTAL (brief Phase 6C) : une analyse visuelle ne devient
// JAMAIS une fausse mesure précise. Le résultat est TOUJOURS une
// FOURCHETTE (`minPercent`/`maxPercent`), jamais un unique nombre à
// plusieurs décimales. `referencePercent` (point médian) est dérivé de
// manière déterministe, jamais fourni indépendamment par le moteur.
//
// Ce fichier définit le CONTRAT indépendant du provider (§16 du brief) —
// l'UI et le reste de Cortex ne dépendent jamais du JSON brut renvoyé par
// l'edge function/le modèle vision. L'edge function `estimate-body-fat-photo`
// est responsable de produire un objet conforme à `RawPhotoEstimateResponse`
// ; `normalizePhotoEstimateResponse` ci-dessous fait la seule traduction
// vers le type de domaine `PhotoBodyFatEstimate`.
//
// Confiance : réutilise EXCLUSIVEMENT `BODY_FAT_METHOD_CONFIDENCE.
// photo_estimate` (Phase 6A, `low`) — jamais un second système ni un
// pourcentage de confiance inventé (§20 du brief).

import {
  getBodyFatConfidence,
  isValidBodyFatPercent,
  type ConfidenceLevel,
} from "./bodyComposition";

export const PHOTO_BODY_FAT_ENGINE_VERSION = "photo_body_fat_v1" as const;
export type PhotoBodyFatEngineVersion = typeof PHOTO_BODY_FAT_ENGINE_VERSION;

export type PhotoEstimateStatus = "success" | "insufficient_quality" | "failed";

/**
 * Largeur MINIMALE d'une fourchette produite par l'analyse photo, en points
 * de %. Règle produit PRUDENTE (documentée comme telle, PAS une certitude
 * scientifique, §18 du brief) : une analyse visuelle générale ne justifie
 * jamais une précision du type "15.0–15.2 %". Si le moteur renvoie une
 * fourchette plus étroite, elle est élargie symétriquement autour de son
 * point médian jusqu'à cette largeur minimale.
 */
export const PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT = 3;

/** Arrondi d'affichage — au 0,5 % près (§19 du brief : éviter les décimales multiples, mais 1 point entier serait trop grossier pour une fourchette déjà large). */
const DISPLAY_ROUNDING_STEP = 0.5;

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ---------------------------------------------------------------------
// Type "brut" attendu de l'edge function — c'est la SEULE frontière où
// Cortex connaît la forme du JSON produit par l'analyse (jamais exposée
// au-delà de `normalizePhotoEstimateResponse`).
// ---------------------------------------------------------------------

export interface RawPhotoEstimateResponse {
  status: PhotoEstimateStatus;
  minPercent: number | null;
  maxPercent: number | null;
  warnings: string[];
}

export interface PhotoBodyFatEstimate {
  status: PhotoEstimateStatus;
  /** `null` sauf si `status === "success"`. */
  minPercent: number | null;
  maxPercent: number | null;
  /** Point médian, dérivé de manière déterministe — jamais une valeur fournie séparément par le moteur. */
  referencePercent: number | null;
  method: "photo_estimate";
  engineVersion: PhotoBodyFatEngineVersion;
  /** `getBodyFatConfidence("photo_estimate")` — `null` si `status !== "success"`. */
  confidence: ConfidenceLevel | null;
  warnings: string[];
}

/**
 * Traduit la réponse brute de l'edge function en type de domaine Cortex —
 * applique le garde-fou de largeur minimale et l'arrondi d'affichage.
 * Ne fait AUCUN appel réseau, fonction pure et testable indépendamment du
 * provider (§45 du brief : mocker uniquement dans les tests, jamais
 * présenter un mock comme une analyse réelle).
 */
export function normalizePhotoEstimateResponse(
  raw: RawPhotoEstimateResponse,
): PhotoBodyFatEstimate {
  const empty = (status: PhotoEstimateStatus, warnings: string[]): PhotoBodyFatEstimate => ({
    status,
    minPercent: null,
    maxPercent: null,
    referencePercent: null,
    method: "photo_estimate",
    engineVersion: PHOTO_BODY_FAT_ENGINE_VERSION,
    confidence: null,
    warnings,
  });

  if (raw.status !== "success") {
    return empty(raw.status, raw.warnings);
  }

  if (!isValidBodyFatPercent(raw.minPercent) || !isValidBodyFatPercent(raw.maxPercent)) {
    return empty("failed", [
      ...raw.warnings,
      "Réponse d'analyse invalide (fourchette hors plage plausible).",
    ]);
  }
  if (raw.minPercent > raw.maxPercent) {
    return empty("failed", [...raw.warnings, "Réponse d'analyse invalide (bornes inversées)."]);
  }

  let min = raw.minPercent;
  let max = raw.maxPercent;
  const width = max - min;
  if (width < PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT) {
    const mid = (min + max) / 2;
    min = mid - PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT / 2;
    max = mid + PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT / 2;
  }

  min = Math.max(1, roundToStep(min, DISPLAY_ROUNDING_STEP));
  max = Math.min(70, roundToStep(max, DISPLAY_ROUNDING_STEP));
  if (min > max) [min, max] = [max, min]; // filet de sécurité après arrondi/clamp aux bornes

  const referencePercent = roundToStep((min + max) / 2, DISPLAY_ROUNDING_STEP);

  return {
    status: "success",
    minPercent: min,
    maxPercent: max,
    referencePercent,
    method: "photo_estimate",
    engineVersion: PHOTO_BODY_FAT_ENGINE_VERSION,
    confidence: getBodyFatConfidence("photo_estimate"),
    warnings: raw.warnings,
  };
}

// ---------------------------------------------------------------------
// Masse grasse / masse maigre EN FOURCHETTE — réutilise `isValidBodyFatPercent`
// (Phase 6A) pour la validation, mais retourne un intervalle plutôt qu'un
// point (§26/§27 du brief). Attention au sens des bornes : le maximum de
// masse grasse correspond au maximum de %BF, et donc au MINIMUM de masse
// maigre (poids fixe) — testé explicitement.
// ---------------------------------------------------------------------

export interface MassRange {
  minKg: number | null;
  maxKg: number | null;
}

function isValidPositiveWeight(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function computeFatMassRange(
  weightKg: number | null | undefined,
  minPercent: number | null | undefined,
  maxPercent: number | null | undefined,
): MassRange {
  if (
    !isValidPositiveWeight(weightKg) ||
    !isValidBodyFatPercent(minPercent) ||
    !isValidBodyFatPercent(maxPercent)
  ) {
    return { minKg: null, maxKg: null };
  }
  return {
    minKg: Math.round(((weightKg * minPercent) / 100) * 10) / 10,
    maxKg: Math.round(((weightKg * maxPercent) / 100) * 10) / 10,
  };
}

export function computeLeanMassRange(
  weightKg: number | null | undefined,
  minPercent: number | null | undefined,
  maxPercent: number | null | undefined,
): MassRange {
  if (!isValidPositiveWeight(weightKg)) return { minKg: null, maxKg: null };
  const fatRange = computeFatMassRange(weightKg, minPercent, maxPercent);
  if (fatRange.minKg == null || fatRange.maxKg == null) return { minKg: null, maxKg: null };
  // Inversion volontaire : masse grasse MAX ⇒ masse maigre MIN, et inversement.
  return {
    minKg: Math.round((weightKg - fatRange.maxKg) * 10) / 10,
    maxKg: Math.round((weightKg - fatRange.minKg) * 10) / 10,
  };
}
