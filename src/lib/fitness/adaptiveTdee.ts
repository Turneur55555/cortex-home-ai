// Pure domain logic for the TDEE OBSERVÉ (adaptive TDEE foundation) — Phase
// 3A de la refonte Santé nutritionnelle. No React, no Supabase, no UI tokens.
//
// À ne JAMAIS confondre avec le TDEE MODÉLISÉ (lib/fitness/tdee.ts,
// `BMR + NEAT + EAT + TEF`) : ce moteur estime statistiquement la dépense
// compatible avec ce que l'utilisateur a RÉELLEMENT mangé et RÉELLEMENT pesé,
// sur une fenêtre suffisamment longue et lissée. Les deux valeurs restent
// disponibles séparément ; cette phase ne fait qu'OBSERVER et COMPARER — elle
// ne corrige rien automatiquement (ni le TDEE modélisé affiché comme
// référence, ni les objectifs caloriques, ni les macros, ni aucune
// recommandation). Ce sera l'objet d'une Phase 3B distincte, avec garde-fous.
//
// Principe énergétique : variation des réserves ≈ apports − dépense, donc
// dépense ≈ apports − variation des réserves. Mais un poids quotidien brut
// est dominé par du bruit (eau, glycogène, sodium, contenu digestif,
// inflammation, heure de pesée) : on ne calcule JAMAIS une dépense à partir
// d'une variation de poids sur 24-48h. Le calcul n'est fait que sur une
// TENDANCE lissée, jamais sur des points bruts.

import { movingAverage } from "./body";
import { KCAL_PER_KG_BODY_MASS } from "./energyConstants";

// ---------------------------------------------------------------------
// Constantes centralisées — seuils et coefficients, modifiables ici sans
// toucher à la logique ni à l'UI.
// ---------------------------------------------------------------------

export const ADAPTIVE_TDEE_THRESHOLDS = {
  /** Fenêtre d'analyse maximale (jours glissants avant "aujourd'hui"). */
  ANALYSIS_WINDOW_DAYS: 28,
  /** Largeur du lissage de la tendance de poids (moyenne glissante). */
  SMOOTHING_WINDOW_DAYS: 7,
  /**
   * kcal ≈ équivalent énergétique d'1 kg de masse corporelle — voir
   * `energyConstants.ts` (seul point de vérité, également réutilisé par
   * `calorieStrategy.ts` Phase 4A). Volontairement appliquée uniquement à
   * une TENDANCE lissée (jamais à une variation brute 24-48h, voir plus haut).
   */
  KCAL_PER_KG: KCAL_PER_KG_BODY_MASS,
  /** Seuils pour le statut "early_estimate" (estimation précoce, prudente). */
  EARLY: {
    MIN_CALENDAR_DAYS: 7,
    MIN_WEIGHT_MEASUREMENTS: 4,
    /**
     * mesures / jour de fenêtre — repère la "14j mais 2 pesées". Abaissé de
     * 0.30 à 0.20 en Phase 10 (§3 du brief), après audit explicite :
     *  - 0.30 exigeait en pratique > 1 pesée tous les 3.3 jours pour
     *    seulement obtenir un statut "précoce" — plus strict que le rythme
     *    de pesée que Cortex documente lui-même comme attendu ("quelques
     *    pesées par semaine, parfois irrégulières", voir computeWeightTrend
     *    ci-dessous). Un utilisateur pesant 2×/semaine EXACTEMENT (densité
     *    ≈ 0.286, un rythme tout à fait raisonnable) échouait déjà ce seuil.
     *  - Ce n'est PAS le seul garde-fou contre des pesées trop clairsemées :
     *    `MIN_CALENDAR_DAYS`/`MIN_WEIGHT_MEASUREMENTS` filtrent déjà les cas
     *    extrêmes, et `computeWeightTrend` retombe indépendamment sur
     *    `weeklyTrendKg: null` (→ insufficient_data, voir determineStatus)
     *    si la régression sur points lissés ne peut réellement pas être
     *    calculée (moins de 2 points exploitables) — la densité n'est donc
     *    pas le seul rempart contre un signal trop bruité.
     *  - 0.20 reste strictement AU-DESSUS du cas déjà couvert par le test
     *    "pesées trop espacées... (densité)" (4 pesées / 26 j ≈ 0.15,
     *    toujours rejeté) — ce n'est pas un abaissement ad hoc pour un cas
     *    particulier, la marge reste large sous le nouveau seuil.
     *  - `ESTABLISHED.MIN_WEIGHT_DENSITY` (0.4, statut de confiance
     *    supérieure) reste INCHANGÉ — seule la barre d'entrée "précoce" est
     *    assouplie, jamais le niveau de confiance le plus élevé.
     */
    MIN_WEIGHT_DENSITY: 0.2,
    /** jours avec au moins un aliment loggé / jours de fenêtre. */
    MIN_NUTRITION_COVERAGE: 0.4,
  },
  /** Seuils pour le statut "established" (estimation exploitable). */
  ESTABLISHED: {
    MIN_CALENDAR_DAYS: 14,
    MIN_WEIGHT_MEASUREMENTS: 8,
    MIN_WEIGHT_DENSITY: 0.4,
    MIN_NUTRITION_COVERAGE: 0.6,
  },
} as const;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/**
 * Source de vérité poids : `body_tracking` (voir useBodyMeasurements),
 * réutilisée telle quelle — aucune nouvelle table. `created_at` sert
 * uniquement à départager plusieurs pesées le même jour (voir §14).
 */
export interface WeightSampleInput {
  date: string; // YYYY-MM-DD
  weight: number | null;
  created_at?: string | null;
}

/**
 * Source de vérité calories : `nutrition` (voir useNutrition /
 * useNutritionRange), un enregistrement par aliment loggé — réutilisée telle
 * quelle. Un jour sans AUCUNE ligne = absence de donnée (jamais 0 kcal).
 */
export interface NutritionLogInput {
  date: string; // YYYY-MM-DD
  calories: number | null;
}

export type AdaptiveTdeeStatus = "insufficient_data" | "early_estimate" | "established";
export type AdaptiveTdeeConfidence = "low" | "medium" | "high";

export interface AdaptiveTdeeWindow {
  startDate: string | null;
  endDate: string | null;
  calendarDays: number;
}

export interface AdaptiveTdeeWeight {
  measurementCount: number;
  startTrendKg: number | null;
  endTrendKg: number | null;
  trendChangeKg: number | null;
  weeklyTrendKg: number | null;
}

export interface AdaptiveTdeeNutrition {
  loggedDays: number;
  coverage: number;
  averageCalories: number | null;
}

export interface AdaptiveTdeeComparison {
  modeledTdeeKcal: number;
  deltaKcal: number;
  deltaPercent: number;
}

export interface AdaptiveTdeeResult {
  status: AdaptiveTdeeStatus;
  /** kcal/j, `null` si `status === "insufficient_data"`. */
  observedTdeeKcal: number | null;
  /** `null` uniquement si `status === "insufficient_data"`. */
  confidence: AdaptiveTdeeConfidence | null;
  window: AdaptiveTdeeWindow;
  weight: AdaptiveTdeeWeight;
  nutrition: AdaptiveTdeeNutrition;
  /** kcal/j — équivalent énergétique de la tendance de poids (positif = stockage, négatif = déstockage). `null` si non calculable. */
  energyEquivalentKcalPerDay: number | null;
  /** Comparaison informative avec le TDEE modélisé — `null` si l'un des deux manque. Jamais utilisée pour corriger quoi que ce soit dans cette phase. */
  comparison: AdaptiveTdeeComparison | null;
  /** Explication courte, humaine, de l'état retourné (raison du statut). */
  reason: string;
}

export interface AdaptiveTdeeInput {
  weightSamples: ReadonlyArray<WeightSampleInput>;
  nutritionLogs: ReadonlyArray<NutritionLogInput>;
  /** TDEE modélisé du jour (computeDailyTDEE(...).totalKcal) — pour comparaison uniquement. */
  modeledTdeeKcal: number | null;
  /** Date "aujourd'hui" (YYYY-MM-DD) — fournie par l'appelant pour un moteur pur et testable. */
  today: string;
}

// ---------------------------------------------------------------------
// Utilitaires date (chaînes YYYY-MM-DD, pas de dépendance externe)
// ---------------------------------------------------------------------

function parseISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function addDaysISO(date: string, delta: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseISODate(date).getTime());
}

// ---------------------------------------------------------------------
// Poids — dédoublonnage, filtrage, tendance lissée
// ---------------------------------------------------------------------

/**
 * Bornes physiologiques défensives (alignées sur le CHECK de `body_tracking`
 * en base : weight >= 20 AND weight <= 500). Ne rejette QUE l'impossible
 * (NaN/Infinity/négatif/hors bornes) — une valeur inhabituelle mais réelle
 * (ex. -1.5 kg en une semaine) n'est jamais supprimée : c'est le lissage,
 * pas la suppression, qui absorbe le bruit physiologique normal.
 */
function isPlausibleWeight(weight: number | null | undefined): weight is number {
  return typeof weight === "number" && Number.isFinite(weight) && weight >= 20 && weight <= 500;
}

/**
 * Une pesée par jour. Stratégie déterministe pour les doublons (§14) :
 * `body_tracking` n'a pas de contrainte d'unicité sur (user, date) — un
 * utilisateur peut se peser plusieurs fois le même jour (correction d'une
 * saisie, deuxième pesée). On retient la DERNIÈRE pesée du jour par
 * `created_at` (la valeur la plus récemment enregistrée gagne — cohérent
 * avec "je corrige/actualise ma pesée du jour"). Si `created_at` est absent
 * ou à égalité, on retient la dernière rencontrée dans l'ordre du tableau
 * d'entrée (l'appelant est libre de choisir cet ordre).
 */
function dedupWeightByDay(samples: ReadonlyArray<WeightSampleInput>): Map<string, number> {
  const byDay = new Map<string, { weight: number; created_at: string | null; index: number }>();
  samples.forEach((sample, index) => {
    if (!isValidDateString(sample.date) || !isPlausibleWeight(sample.weight)) return;
    const existing = byDay.get(sample.date);
    const created_at = sample.created_at ?? null;
    if (!existing) {
      byDay.set(sample.date, { weight: sample.weight, created_at, index });
      return;
    }
    const isNewer =
      created_at != null && existing.created_at != null
        ? created_at >= existing.created_at
        : index >= existing.index;
    if (isNewer) {
      byDay.set(sample.date, { weight: sample.weight, created_at, index });
    }
  });
  const result = new Map<string, number>();
  for (const [date, entry] of byDay) result.set(date, entry.weight);
  return result;
}

/** Régression linéaire (moindres carrés) : y = intercept + slope * x. */
function linearRegression(points: ReadonlyArray<{ x: number; y: number }>): {
  slope: number;
  intercept: number;
} | null {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return { slope: 0, intercept: meanY };
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

/**
 * Tendance de poids lissée sur [startDate, endDate] (inclus).
 *
 * Méthode retenue : moyenne glissante de 7 jours (réutilise `movingAverage`
 * de lib/fitness/body.ts, déjà utilisée ailleurs dans Cortex pour ce même
 * usage) sur une série journalière construite à partir des pesées réelles
 * (jours sans pesée = `null`, jamais interpolés), PUIS régression linéaire
 * sur les points lissés non-nuls pour obtenir une pente kg/jour.
 *
 * Pourquoi cette combinaison plutôt qu'un simple "dernier point − premier
 * point" : le lissage 7 jours absorbe le bruit court terme (eau, glycogène,
 * sodium, digestion, heure de pesée) ; la régression sur la série lissée
 * évite qu'un unique point de bruit résiduel en début/fin de fenêtre ne
 * fausse toute la tendance. Volontairement PAS de modèle plus complexe
 * (Kalman, EWMA à paramètres multiples, etc.) : la donnée Cortex (quelques
 * pesées par semaine, parfois irrégulières) ne justifie pas cette
 * sophistication et une régression simple reste explicable à l'utilisateur.
 */
function computeWeightTrend(
  samples: ReadonlyArray<WeightSampleInput>,
  startDate: string,
  endDate: string,
): AdaptiveTdeeWeight & { measurementCount: number } {
  const byDay = dedupWeightByDay(samples).entries();
  const inWindow = [...byDay].filter(
    ([date]) => date >= startDate && date <= endDate && isValidDateString(date),
  );
  const measurementCount = inWindow.length;

  if (measurementCount === 0) {
    return {
      measurementCount: 0,
      startTrendKg: null,
      endTrendKg: null,
      trendChangeKg: null,
      weeklyTrendKg: null,
    };
  }

  const weightByDate = new Map(inWindow);
  const calendarDays = daysBetweenISO(startDate, endDate) + 1;
  const dailySeries = Array.from({ length: calendarDays }, (_, i) => {
    const date = addDaysISO(startDate, i);
    return { date, value: weightByDate.get(date) ?? null };
  });

  const smoothed = movingAverage(dailySeries, ADAPTIVE_TDEE_THRESHOLDS.SMOOTHING_WINDOW_DAYS);
  const allPoints = smoothed
    .map((p, i) => ({ x: i, y: p.avg }))
    .filter((p): p is { x: number; y: number } => p.y != null);

  // Les tout premiers jours lissés ont une fenêtre de moyenne glissante
  // partielle (moins de SMOOTHING_WINDOW_DAYS points) : leur "centre"
  // statistique n'est pas le même que celui des jours à fenêtre pleine, ce
  // qui biaiserait la régression si on les inclut (surtout sur une fenêtre
  // d'analyse courte). On préfère donc régresser uniquement sur les points à
  // fenêtre pleine ; on ne retombe sur l'ensemble des points disponibles que
  // si la fenêtre d'analyse est trop courte pour en produire au moins 2.
  const fullWindowPoints = allPoints.filter(
    (p) => p.x >= ADAPTIVE_TDEE_THRESHOLDS.SMOOTHING_WINDOW_DAYS - 1,
  );
  const points = fullWindowPoints.length >= 2 ? fullWindowPoints : allPoints;

  const regression = linearRegression(points);
  if (!regression || points.length < 2) {
    return {
      measurementCount,
      startTrendKg: null,
      endTrendKg: null,
      trendChangeKg: null,
      weeklyTrendKg: null,
    };
  }

  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  const startTrendKg = Math.round((regression.intercept + regression.slope * firstX) * 100) / 100;
  const endTrendKg = Math.round((regression.intercept + regression.slope * lastX) * 100) / 100;
  const trendChangeKg = Math.round((endTrendKg - startTrendKg) * 100) / 100;
  const weeklyTrendKg = Math.round(regression.slope * 7 * 100) / 100;

  return { measurementCount, startTrendKg, endTrendKg, trendChangeKg, weeklyTrendKg };
}

// ---------------------------------------------------------------------
// Nutrition — couverture et apport moyen
// ---------------------------------------------------------------------

/**
 * Couverture nutritionnelle sur [startDate, endDate]. Un jour est "loggé"
 * dès qu'AU MOINS une ligne `nutrition` existe pour cette date — un jour
 * sans aucune ligne n'est JAMAIS traité comme "0 kcal" (absence de données
 * ≠ jeûne), il est simplement exclu de `averageCalories` et ne compte pas
 * dans `loggedDays`. Des calories négatives (impossibles en pratique, déjà
 * bloquées par le CHECK de la table `nutrition`, mais testées ici pour la
 * robustesse) sont ignorées dans la somme du jour sans invalider le jour
 * lui-même (une ligne existe bel et bien, donc le jour reste "loggé").
 */
function computeNutritionCoverage(
  logs: ReadonlyArray<NutritionLogInput>,
  startDate: string,
  endDate: string,
  calendarDays: number,
): AdaptiveTdeeNutrition {
  const totalsByDay = new Map<string, number>();
  const daysWithLog = new Set<string>();

  for (const log of logs) {
    if (!isValidDateString(log.date) || log.date < startDate || log.date > endDate) continue;
    daysWithLog.add(log.date);
    const calories =
      typeof log.calories === "number" && Number.isFinite(log.calories) && log.calories >= 0
        ? log.calories
        : 0;
    totalsByDay.set(log.date, (totalsByDay.get(log.date) ?? 0) + calories);
  }

  const loggedDays = daysWithLog.size;
  const coverage = calendarDays > 0 ? Math.round((loggedDays / calendarDays) * 1000) / 1000 : 0;
  const averageCalories =
    loggedDays > 0
      ? Math.round([...totalsByDay.values()].reduce((sum, kcal) => sum + kcal, 0) / loggedDays)
      : null;

  return { loggedDays, coverage, averageCalories };
}

// ---------------------------------------------------------------------
// Statut et confiance
// ---------------------------------------------------------------------

function determineStatus(
  calendarDays: number,
  weight: AdaptiveTdeeWeight & { measurementCount: number },
  nutrition: AdaptiveTdeeNutrition,
): { status: AdaptiveTdeeStatus; reason: string } {
  const { EARLY, ESTABLISHED } = ADAPTIVE_TDEE_THRESHOLDS;
  const measurementCount = weight.measurementCount;
  const density = calendarDays > 0 ? measurementCount / calendarDays : 0;

  if (calendarDays < EARLY.MIN_CALENDAR_DAYS) {
    return {
      status: "insufficient_data",
      reason: `Historique trop court (${calendarDays} j, ${EARLY.MIN_CALENDAR_DAYS} j minimum).`,
    };
  }
  if (measurementCount < EARLY.MIN_WEIGHT_MEASUREMENTS) {
    return {
      status: "insufficient_data",
      reason: `Pas assez de pesées (${measurementCount}, ${EARLY.MIN_WEIGHT_MEASUREMENTS} minimum).`,
    };
  }
  if (density < EARLY.MIN_WEIGHT_DENSITY) {
    return {
      status: "insufficient_data",
      reason: `Pesées trop espacées sur la période (${measurementCount} pesées sur ${calendarDays} j).`,
    };
  }
  if (weight.weeklyTrendKg == null) {
    return {
      status: "insufficient_data",
      reason: "Tendance de poids non calculable (pesées trop concentrées après lissage).",
    };
  }
  if (nutrition.coverage < EARLY.MIN_NUTRITION_COVERAGE) {
    return {
      status: "insufficient_data",
      reason: `Couverture nutritionnelle insuffisante (${Math.round(nutrition.coverage * 100)} %, ${Math.round(EARLY.MIN_NUTRITION_COVERAGE * 100)} % minimum).`,
    };
  }

  const meetsEstablished =
    calendarDays >= ESTABLISHED.MIN_CALENDAR_DAYS &&
    measurementCount >= ESTABLISHED.MIN_WEIGHT_MEASUREMENTS &&
    density >= ESTABLISHED.MIN_WEIGHT_DENSITY &&
    nutrition.coverage >= ESTABLISHED.MIN_NUTRITION_COVERAGE;

  if (meetsEstablished) {
    return {
      status: "established",
      reason: `Estimation établie sur ${calendarDays} j (${measurementCount} pesées, ${Math.round(nutrition.coverage * 100)} % de couverture nutritionnelle).`,
    };
  }

  return {
    status: "early_estimate",
    reason: `Estimation précoce sur ${calendarDays} j (${measurementCount} pesées, ${Math.round(nutrition.coverage * 100)} % de couverture nutritionnelle) — encore prudente.`,
  };
}

function determineConfidence(
  status: AdaptiveTdeeStatus,
  calendarDays: number,
  measurementCount: number,
  nutrition: AdaptiveTdeeNutrition,
): AdaptiveTdeeConfidence | null {
  if (status === "insufficient_data") return null;
  if (status === "early_estimate") return "low";

  const { ESTABLISHED } = ADAPTIVE_TDEE_THRESHOLDS;
  const isHigh =
    calendarDays >= ESTABLISHED.MIN_CALENDAR_DAYS * 2 &&
    measurementCount >= ESTABLISHED.MIN_WEIGHT_MEASUREMENTS * 2 &&
    nutrition.coverage >= 0.8;
  return isHigh ? "high" : "medium";
}

// ---------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------

/**
 * TDEE OBSERVÉ ≈ apport calorique moyen − variation énergétique moyenne des
 * réserves (voir en-tête de fichier). Ne fonctionne que sur une fenêtre
 * suffisamment fiable — voir `determineStatus`. Aucune dépendance à une
 * source externe (Apple Health/Garmin/Whoop/Fitbit/Oura) : uniquement
 * poids Cortex (`body_tracking`), nutrition Cortex (`nutrition`) et le TDEE
 * modélisé Cortex (`computeDailyTDEE`), fournis par l'appelant.
 */
export function computeAdaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const { ANALYSIS_WINDOW_DAYS } = ADAPTIVE_TDEE_THRESHOLDS;
  const today = isValidDateString(input.today) ? input.today : null;

  if (!today) {
    return {
      status: "insufficient_data",
      observedTdeeKcal: null,
      confidence: null,
      window: { startDate: null, endDate: null, calendarDays: 0 },
      weight: {
        measurementCount: 0,
        startTrendKg: null,
        endTrendKg: null,
        trendChangeKg: null,
        weeklyTrendKg: null,
      },
      nutrition: { loggedDays: 0, coverage: 0, averageCalories: null },
      energyEquivalentKcalPerDay: null,
      comparison: null,
      reason: "Date de référence invalide.",
    };
  }

  const analysisStart = addDaysISO(today, -(ANALYSIS_WINDOW_DAYS - 1));
  const weightInAnalysisWindow = [...dedupWeightByDay(input.weightSamples).entries()].filter(
    ([date]) => date >= analysisStart && date <= today,
  );

  if (weightInAnalysisWindow.length === 0) {
    return {
      status: "insufficient_data",
      observedTdeeKcal: null,
      confidence: null,
      window: { startDate: null, endDate: null, calendarDays: 0 },
      weight: {
        measurementCount: 0,
        startTrendKg: null,
        endTrendKg: null,
        trendChangeKg: null,
        weeklyTrendKg: null,
      },
      nutrition: { loggedDays: 0, coverage: 0, averageCalories: null },
      energyEquivalentKcalPerDay: null,
      comparison: null,
      reason: "Aucune pesée exploitable sur la fenêtre d'analyse.",
    };
  }

  // Fenêtre = de la plus ancienne pesée exploitable jusqu'à aujourd'hui —
  // reflète la couverture réelle plutôt qu'une fenêtre fixe artificielle.
  const startDate = weightInAnalysisWindow.reduce(
    (min, [date]) => (date < min ? date : min),
    weightInAnalysisWindow[0][0],
  );
  const endDate = today;
  const calendarDays = daysBetweenISO(startDate, endDate) + 1;

  const weight = computeWeightTrend(input.weightSamples, startDate, endDate);
  const nutrition = computeNutritionCoverage(input.nutritionLogs, startDate, endDate, calendarDays);

  const { status, reason } = determineStatus(calendarDays, weight, nutrition);
  const confidence = determineConfidence(status, calendarDays, weight.measurementCount, nutrition);

  let observedTdeeKcal: number | null = null;
  let energyEquivalentKcalPerDay: number | null = null;

  if (
    status !== "insufficient_data" &&
    weight.weeklyTrendKg != null &&
    nutrition.averageCalories != null
  ) {
    energyEquivalentKcalPerDay =
      Math.round(((weight.weeklyTrendKg * ADAPTIVE_TDEE_THRESHOLDS.KCAL_PER_KG) / 7) * 10) / 10;
    observedTdeeKcal = Math.round(nutrition.averageCalories - energyEquivalentKcalPerDay);
  }

  const comparison: AdaptiveTdeeComparison | null =
    observedTdeeKcal != null && input.modeledTdeeKcal != null
      ? {
          modeledTdeeKcal: input.modeledTdeeKcal,
          deltaKcal: Math.round(observedTdeeKcal - input.modeledTdeeKcal),
          deltaPercent:
            input.modeledTdeeKcal !== 0
              ? Math.round(
                  ((observedTdeeKcal - input.modeledTdeeKcal) / input.modeledTdeeKcal) * 1000,
                ) / 10
              : 0,
        }
      : null;

  return {
    status,
    observedTdeeKcal,
    confidence,
    window: { startDate, endDate, calendarDays },
    weight: {
      measurementCount: weight.measurementCount,
      startTrendKg: weight.startTrendKg,
      endTrendKg: weight.endTrendKg,
      trendChangeKg: weight.trendChangeKg,
      weeklyTrendKg: weight.weeklyTrendKg,
    },
    nutrition,
    energyEquivalentKcalPerDay,
    comparison,
    reason,
  };
}
