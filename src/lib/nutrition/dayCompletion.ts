// Journée nutrition « complète » — zéro React, zéro réseau.
//
// Mesure de production (01/11/2026, 60 jours) : le dîner n'est saisi que 7
// jours sur 27. Une journée entamée (petit-déjeuner, déjeuner, goûter) mais
// sans dîner pèse 700 à 1 100 kcal, contre 1 600 à 1 900 quand le dîner est
// saisi. Compter ces journées dans les moyennes affichait 1 091 kcal pour un
// objectif de 1 800 et faussait d'autant le TDEE observé : ce n'était pas un
// déficit, c'était un dîner non noté.
//
// Règle : une journée compte dans les moyennes si elle est COMPLÈTE, c'est-à-
// dire si le joueur l'a bouclée (« j'ai fini pour aujourd'hui », table
// `nutrition_day_closures`) OU si son dîner est saisi. Une journée seulement
// entamée est une absence de donnée — jamais une sous-consommation.
//
// L'état n'est jamais stocké : il se dérive à la lecture du journal et des
// clôtures, rien ne peut diverger.

import type { MealSlug } from "./meals";

/** Le repas dont la présence suffit à considérer la journée complète. */
export const DAY_COMPLETING_MEAL: MealSlug = "diner";

export type DayCompletion =
  /** Aucun aliment saisi. */
  | "empty"
  /** Bouclée explicitement par le joueur. */
  | "closed"
  /** Non bouclée, mais le dîner est saisi : complète. */
  | "dinner"
  /** Entamée, ni bouclée ni dîner : exclue des moyennes. */
  | "open";

export function dayCompletion(input: {
  hasEntries: boolean;
  hasDinner: boolean;
  closed: boolean;
}): DayCompletion {
  if (!input.hasEntries) return "empty";
  if (input.closed) return "closed";
  if (input.hasDinner) return "dinner";
  return "open";
}

export function isCompleteDay(c: DayCompletion): boolean {
  return c === "closed" || c === "dinner";
}

/**
 * Dates complètes, à partir des lignes du journal (date + repas) et des
 * dates bouclées. Une date bouclée sans aucun aliment n'est PAS complète :
 * une journée vide n'est jamais comptée comme « 0 kcal ».
 */
export function completeDates(
  rows: ReadonlyArray<{ date: string; meal: string | null }>,
  closedDates: ReadonlySet<string>,
): Set<string> {
  const withEntries = new Set<string>();
  const withDinner = new Set<string>();
  for (const r of rows) {
    withEntries.add(r.date);
    if (r.meal === DAY_COMPLETING_MEAL) withDinner.add(r.date);
  }
  const out = new Set<string>();
  for (const date of withEntries) {
    const c = dayCompletion({
      hasEntries: true,
      hasDinner: withDinner.has(date),
      closed: closedDates.has(date),
    });
    if (isCompleteDay(c)) out.add(date);
  }
  return out;
}

/**
 * Même règle que `completeDates`, à partir d'une série déjà agrégée par jour
 * (historique : un jour = ses totaux + « dîner saisi »).
 */
export function completeDatesFromSeries(
  series: ReadonlyArray<{ date: string; calories: number; hasDinner: boolean }>,
  closedDates: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const d of series) {
    const c = dayCompletion({
      hasEntries: d.calories > 0,
      hasDinner: d.hasDinner,
      closed: closedDates.has(d.date),
    });
    if (isCompleteDay(c)) out.add(d.date);
  }
  return out;
}

/** Un jour de la série d'historique (totaux du jour). */
export interface DayTotals {
  date: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

export interface CompleteDaysAverage {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  /** Journées complètes comptées dans la moyenne. */
  completeDays: number;
  /** Journées entamées mais incomplètes, exclues de la moyenne. */
  excludedDays: number;
}

/**
 * Moyenne sur les `n` derniers jours de la série, en ne comptant QUE les
 * journées complètes (`completeDays`). Une journée sans aucun aliment n'est ni
 * comptée ni « exclue » : c'est une absence de suivi, pas une journée ratée.
 */
export function averageOverCompleteDays(
  series: ReadonlyArray<DayTotals>,
  n: number,
  completeDays: ReadonlySet<string>,
): CompleteDaysAverage {
  const window = series.slice(-n).filter((d) => d.calories > 0);
  const kept = window.filter((d) => completeDays.has(d.date));
  const excludedDays = window.length - kept.length;
  if (kept.length === 0) {
    return { calories: 0, proteins: 0, carbs: 0, fats: 0, completeDays: 0, excludedDays };
  }
  const sum = kept.reduce(
    (a, d) => ({
      calories: a.calories + d.calories,
      proteins: a.proteins + d.proteins,
      carbs: a.carbs + d.carbs,
      fats: a.fats + d.fats,
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 },
  );
  const k = kept.length;
  return {
    calories: Math.round(sum.calories / k),
    proteins: Math.round(sum.proteins / k),
    carbs: Math.round(sum.carbs / k),
    fats: Math.round(sum.fats / k),
    completeDays: k,
    excludedDays,
  };
}

/**
 * Une journée qu'on s'apprête à copier (« Copier hier ») et qui n'est pas
 * complète propagerait une journée incomplète : l'appelant prévient.
 */
export function shouldWarnBeforeCopying(c: DayCompletion): boolean {
  return c === "open";
}
