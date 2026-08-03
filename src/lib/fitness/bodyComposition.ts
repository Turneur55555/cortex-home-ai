// Pure domain logic for la COMPOSITION CORPORELLE — Phase 6A de la refonte
// Santé nutritionnelle. No React, no Supabase, no UI tokens.
//
// Fondation : Poids → Body Fat → masse grasse/masse maigre → historique →
// tendance. Principe fondamental (brief Phase 6A) : Cortex ne présente
// JAMAIS toutes les estimations de Body Fat comme ayant la même précision
// — la PROVENANCE (méthode) est une donnée de premier ordre, jamais
// perdue après calcul.
//
// Persistance : `body_tracking` (déjà la table "mesure corporelle datée"
// avant cette phase — voir migration 20260809090000) — `body_fat_method`
// stocké, mais la CONFIANCE n'est jamais stockée : c'est ce mapping
// centralisé (`BODY_FAT_METHOD_CONFIDENCE`) qui fait foi, pour rester
// ajustable sans migration si la stratégie de confiance évolue (§8 du
// brief).
//
// `weight`/`body_fat` de `body_tracking` sont sur la MÊME ligne (même
// date) — c'est déjà le "snapshot" requis par §12/§13 du brief : aucune
// colonne `weight_kg_at_measurement` dédiée nécessaire. `fatMassKg`/
// `leanMassKg` sont CALCULÉS À LA LECTURE (§14 : préférer ne pas stocker
// une valeur dérivée simple), jamais persistés.
//
// IMPORTANT (§11 du brief) : `leanMassKg` n'est PAS `muscleMassKg`. La
// masse maigre comprend l'eau, les os, les organes, etc. — ne jamais
// labelliser "Masse musculaire" dans l'UI à partir de ce calcul.

// ---------------------------------------------------------------------
// Méthodes de mesure du Body Fat
// ---------------------------------------------------------------------

export type BodyFatMethod = "manual" | "dexa" | "bioimpedance" | "measurements" | "photo_estimate";

export const BODY_FAT_METHODS: readonly BodyFatMethod[] = [
  "manual",
  "dexa",
  "bioimpedance",
  "measurements",
  "photo_estimate",
] as const;

/** Méthodes réellement saisissables via l'UI en Phase 6A (§4 du brief — measurements/photo_estimate restent préparées, sans moteur actif). */
export const BODY_FAT_DIRECT_ENTRY_METHODS: readonly BodyFatMethod[] = [
  "manual",
  "dexa",
  "bioimpedance",
] as const;

export const BODY_FAT_METHOD_LABELS: Record<BodyFatMethod, string> = {
  manual: "Manuel",
  dexa: "DEXA",
  bioimpedance: "Impédancemètre",
  measurements: "Mensurations",
  photo_estimate: "Estimation photo",
};

export type ConfidenceLevel = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Estimation indicative",
};

/**
 * Signification documentée (§7 du brief) :
 *  - high   → mesure considérée plus robuste dans Cortex.
 *  - medium → estimation exploitable mais sensible aux conditions.
 *  - low    → estimation indicative.
 *
 * Mapping à auditer scientifiquement si la stratégie évolue (§8) :
 *  - dexa → high : méthode de référence en littérature, mais PAS présentée
 *    comme une vérité absolue pour autant (aucune méthode ne l'est ici).
 *  - bioimpedance → medium : sensible à l'hydratation/l'heure de la
 *    mesure — jamais présentée comme parfaitement exacte.
 *  - measurements → medium : dépend de la formule utilisée (Phase 6B).
 *  - photo_estimate → low : estimation visuelle par nature indicative.
 *  - manual → low PAR DÉFAUT : Cortex ne connaît PAS la provenance réelle
 *    du chiffre saisi par l'utilisateur — ne jamais lui attribuer
 *    artificiellement une confiance élevée (§8 du brief, explicite).
 */
export const BODY_FAT_METHOD_CONFIDENCE: Record<BodyFatMethod, ConfidenceLevel> = {
  dexa: "high",
  bioimpedance: "medium",
  measurements: "medium",
  photo_estimate: "low",
  manual: "low",
};

/** `method` peut être `null` (mesure historique sans provenance connue) — confiance la plus prudente, jamais devinée. */
export function getBodyFatConfidence(method: BodyFatMethod | null | undefined): ConfidenceLevel {
  if (method == null) return "low";
  return BODY_FAT_METHOD_CONFIDENCE[method];
}

// ---------------------------------------------------------------------
// Validation — bornes centralisées, synchronisées avec les CHECK de
// `body_tracking` (migration 20260809090000) : ne jamais dupliquer une
// définition contradictoire (§15/§16 du brief).
// ---------------------------------------------------------------------

export const BODY_FAT_VALID_RANGE = { MIN: 1, MAX: 70 } as const;

export function isValidBodyFatPercent(value: number | null | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= BODY_FAT_VALID_RANGE.MIN &&
    value <= BODY_FAT_VALID_RANGE.MAX
  );
}

function isValidPositiveWeight(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isKnownBodyFatMethod(value: string | null | undefined): value is BodyFatMethod {
  return value != null && (BODY_FAT_METHODS as readonly string[]).includes(value);
}

/**
 * Détermine la méthode à PERSISTER pour une saisie Body Fat (Phase 10 §1) —
 * ne renvoie jamais `null` tant qu'un pourcentage Body Fat est fourni.
 * `selectedMethod` vient de la puce optionnelle choisie par l'utilisateur
 * dans l'UI (`CorpsTab.tsx`/`BodyHistorySheet.tsx`) : si l'utilisateur n'en
 * choisit aucune, on retombe sur `'manual'` — PAS `null` — car `'manual'`
 * porte déjà la sémantique exacte « Cortex ne connaît pas la provenance
 * réelle du chiffre » (confiance "low" par construction, voir
 * `BODY_FAT_METHOD_CONFIDENCE`). Ne jamais inventer une méthode précise
 * (dexa/bioimpedance/measurements/photo_estimate) faute de mieux.
 */
export function resolveBodyFatMethod(
  selectedMethod: BodyFatMethod | null,
  hasBodyFatValue: boolean,
): BodyFatMethod | null {
  if (!hasBodyFatValue) return null;
  return selectedMethod ?? "manual";
}

// ---------------------------------------------------------------------
// Masse grasse / masse maigre — fonctions pures, jamais dans un composant.
// ---------------------------------------------------------------------

/** `null` si `weightKg`/`bodyFatPercent` indisponibles ou invalides — jamais une valeur fabriquée (§33 du brief). */
export function computeFatMass(
  weightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined,
): number | null {
  if (!isValidPositiveWeight(weightKg) || !isValidBodyFatPercent(bodyFatPercent)) return null;
  return Math.round(((weightKg * bodyFatPercent) / 100) * 10) / 10;
}

/** `leanMassKg = weightKg - fatMassKg`. N'est PAS une masse musculaire (§11 du brief) — comprend eau/os/organes/muscle. */
export function computeLeanMass(
  weightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined,
): number | null {
  const fatMass = computeFatMass(weightKg, bodyFatPercent);
  if (fatMass == null || !isValidPositiveWeight(weightKg)) return null;
  return Math.round((weightKg - fatMass) * 10) / 10;
}

/** Point médian d'un intervalle Body Fat (ex. 15–17 % → 16 %) — utilisé uniquement si réellement nécessaire (§5/§34), jamais imposé par défaut. */
export function bodyFatRangeMidpoint(
  minPercent: number | null | undefined,
  maxPercent: number | null | undefined,
): number | null {
  if (!isValidBodyFatPercent(minPercent) || !isValidBodyFatPercent(maxPercent)) return null;
  return Math.round(((minPercent + maxPercent) / 2) * 10) / 10;
}

// ---------------------------------------------------------------------
// Une mesure de composition corporelle — source de vérité minimale (§6).
// ---------------------------------------------------------------------

export interface BodyCompositionMeasurement {
  date: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  bodyFatMinPercent: number | null;
  bodyFatMaxPercent: number | null;
  method: BodyFatMethod | null;
}

export interface BodyCompositionSnapshot {
  date: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  isRange: boolean;
  bodyFatMinPercent: number | null;
  bodyFatMaxPercent: number | null;
  method: BodyFatMethod | null;
  confidence: ConfidenceLevel | null;
  /** `null` si `weightKg` indisponible sur CETTE mesure — jamais recalculé avec un autre poids (§12 du brief : jamais "BF du 1er juin × poids du 1er août"). */
  fatMassKg: number | null;
  leanMassKg: number | null;
}

/** Enrichit une mesure brute avec confiance + masse grasse/maigre dérivées — fonction pure, aucune écriture. */
export function computeBodyCompositionSnapshot(
  measurement: BodyCompositionMeasurement,
): BodyCompositionSnapshot {
  const bodyFatPercent = isValidBodyFatPercent(measurement.bodyFatPercent)
    ? measurement.bodyFatPercent
    : null;
  return {
    date: measurement.date,
    weightKg: isValidPositiveWeight(measurement.weightKg) ? measurement.weightKg : null,
    bodyFatPercent,
    isRange:
      isValidBodyFatPercent(measurement.bodyFatMinPercent) &&
      isValidBodyFatPercent(measurement.bodyFatMaxPercent),
    bodyFatMinPercent: isValidBodyFatPercent(measurement.bodyFatMinPercent)
      ? measurement.bodyFatMinPercent
      : null,
    bodyFatMaxPercent: isValidBodyFatPercent(measurement.bodyFatMaxPercent)
      ? measurement.bodyFatMaxPercent
      : null,
    method: measurement.method,
    confidence: bodyFatPercent != null ? getBodyFatConfidence(measurement.method) : null,
    fatMassKg: computeFatMass(measurement.weightKg, bodyFatPercent),
    leanMassKg: computeLeanMass(measurement.weightKg, bodyFatPercent),
  };
}

// ---------------------------------------------------------------------
// Comparabilité entre méthodes (§18/§19 du brief) — DEXA 15 % → balance
// 17 % ne signifie pas mécaniquement "+2 points de graisse" : les méthodes
// ne sont pas normalisées entre elles en Phase 6A.
// ---------------------------------------------------------------------

/** `true` uniquement si les deux méthodes sont identiques ET connues — jamais deux `null` (provenance inconnue des deux côtés n'implique pas une comparaison fiable). */
export function areBodyFatMethodsComparable(
  a: BodyFatMethod | null,
  b: BodyFatMethod | null,
): boolean {
  return a != null && b != null && a === b;
}

// ---------------------------------------------------------------------
// Tendance — prudente, ne réagit pas à chaque fluctuation (§20 : pas de
// lissage sophistiqué en Phase 6A, l'historique brut est conservé tel
// quel). Compare les deux mesures les plus RÉCENTES ayant un Body Fat
// renseigné, dans l'ordre chronologique fourni par l'appelant.
// ---------------------------------------------------------------------

export interface BodyCompositionTrend {
  comparable: boolean;
  /** Raison si non comparable (méthodes différentes, ou données insuffisantes). */
  reason: string | null;
  bodyFatChangePercent: number | null;
  fatMassChangeKg: number | null;
  leanMassChangeKg: number | null;
  latest: BodyCompositionSnapshot;
  previous: BodyCompositionSnapshot | null;
}

/**
 * `rows` DOIT être trié du plus RÉCENT au plus ANCIEN (même convention que
 * `useBodyMeasurements`, `ORDER BY date DESC`). Ne considère que les
 * mesures avec un `bodyFatPercent` renseigné.
 */
export function computeBodyCompositionTrend(
  rows: ReadonlyArray<BodyCompositionMeasurement>,
): BodyCompositionTrend | null {
  const withBodyFat = rows.filter((r) => isValidBodyFatPercent(r.bodyFatPercent));
  if (withBodyFat.length === 0) return null;

  const latest = computeBodyCompositionSnapshot(withBodyFat[0]);
  if (withBodyFat.length < 2) {
    return {
      comparable: false,
      reason: "Une seule mesure disponible — pas encore de tendance.",
      bodyFatChangePercent: null,
      fatMassChangeKg: null,
      leanMassChangeKg: null,
      latest,
      previous: null,
    };
  }

  const previous = computeBodyCompositionSnapshot(withBodyFat[1]);

  if (!areBodyFatMethodsComparable(latest.method, previous.method)) {
    return {
      comparable: false,
      reason:
        "Méthodes de mesure différentes — comparaison moins fiable, non affichée comme une tendance.",
      bodyFatChangePercent: null,
      fatMassChangeKg: null,
      leanMassChangeKg: null,
      latest,
      previous,
    };
  }

  return {
    comparable: true,
    reason: null,
    bodyFatChangePercent:
      latest.bodyFatPercent != null && previous.bodyFatPercent != null
        ? Math.round((latest.bodyFatPercent - previous.bodyFatPercent) * 10) / 10
        : null,
    fatMassChangeKg:
      latest.fatMassKg != null && previous.fatMassKg != null
        ? Math.round((latest.fatMassKg - previous.fatMassKg) * 10) / 10
        : null,
    leanMassChangeKg:
      latest.leanMassKg != null && previous.leanMassKg != null
        ? Math.round((latest.leanMassKg - previous.leanMassKg) * 10) / 10
        : null,
    latest,
    previous,
  };
}
