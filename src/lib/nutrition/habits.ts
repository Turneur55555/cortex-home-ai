// Habitudes alimentaires dérivées de l'historique — zéro React, zéro réseau.
//
// Mesure de production (01/11/2026, 60 jours) : le joueur mange très
// régulièrement (riz 30 g + poulet 150 g au déjeuner 17 jours, caséine +
// Monster au petit-déjeuner 14 à 16 jours…) mais saisit tout à la main,
// aliment par aliment, et oublie le dîner 20 jours sur 27. Ce module tire de
// l'historique deux choses, sans rien stocker :
//
//   - le REPAS HABITUEL de chaque créneau (ce qu'on propose d'ajouter en un
//     appui quand le créneau est vide) ;
//   - la QUANTITÉ HABITUELLE de chaque aliment (le poids pré-rempli à l'ajout),
//     identique sur tous les appareils puisqu'elle vient de la base et non
//     plus du `localStorage` de l'appareil.
//
// Tout est recalculé à la lecture : une habitude qui change se reflète dès
// les saisies suivantes, rien à réconcilier.

import { MEAL_SLUGS, type MealSlug } from "./meals";
import { calculateNutritionFromGrams, resolveConsumedGrams } from "./weight";

/** Une ligne du journal `nutrition`, réduite aux colonnes utiles ici. */
export interface NutritionHistoryRow {
  date: string;
  meal: string | null;
  name: string | null;
  created_at: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  serving_count: number | null;
  consumed_quantity: number | null;
  consumed_unit: string | null;
  consumed_grams_per_unit: number | null;
}

/** Colonnes à lire en base pour alimenter ce module. */
export const NUTRITION_HISTORY_COLUMNS =
  "date, meal, name, created_at, calories, proteins, carbs, fats, base_calories, base_proteins, base_carbs, base_fats, serving_count, consumed_quantity, consumed_unit, consumed_grams_per_unit";

/**
 * Règles de reconnaissance d'une habitude. Calibrées sur les données réelles :
 * elles retiennent poulet + riz au déjeuner, caséine + Monster au
 * petit-déjeuner, l'œuf au dîner, le chocolat 80 % au goûter — et écartent ce
 * qui n'est apparu qu'une ou deux fois.
 */
export const HABIT_RULES = {
  /** On ne regarde que les N dernières journées où ce repas a été saisi (l'habitude récente). */
  recentMealDays: 10,
  /** Il faut au moins ce nombre de journées pour parler d'habitude. */
  minMealDays: 3,
  /** Un aliment est habituel s'il figure dans au moins cette part des journées regardées… */
  minShare: 0.5,
  /** … et au moins ce nombre de fois. */
  minItemDays: 3,
  /** La quantité habituelle est la médiane des N dernières prises de l'aliment. */
  quantitySample: 5,
} as const;

/** Ce qu'il faut insérer dans le journal pour reprendre l'aliment (sans date ni repas). */
export interface HabitualEntry {
  name: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  serving_count: number;
  percentage_consumed: number;
  consumed_quantity: number | null;
  consumed_unit: string | null;
  consumed_grams_per_unit: number | null;
}

export interface HabitualItem {
  /** Nom normalisé (minuscules, espaces réduits) — identité de l'aliment. */
  key: string;
  /** Journées (parmi celles regardées) où l'aliment figurait à ce repas. */
  days: number;
  /** Poids habituel en grammes ; `null` si l'aliment est saisi sans poids (favori, saisie libre). */
  grams: number | null;
  entry: HabitualEntry;
}

export interface HabitualMeal {
  meal: MealSlug;
  /** Journées regardées pour ce repas (≤ HABIT_RULES.recentMealDays). */
  mealDays: number;
  items: HabitualItem[];
  totals: { calories: number; proteins: number; carbs: number; fats: number };
}

export type HabitualMeals = Partial<Record<MealSlug, HabitualMeal>>;

/** Identité d'un aliment : son nom, sans casse ni espaces superflus. */
export function foodKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m * 10) / 10;
}

/** Plus récente d'abord (date, puis heure de saisie). */
function byRecency(a: NutritionHistoryRow, b: NutritionHistoryRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

function hasPer100(row: NutritionHistoryRow): boolean {
  return row.base_calories != null && Number.isFinite(row.base_calories);
}

/**
 * Médiane des grammes des `HABIT_RULES.quantitySample` dernières prises de
 * l'aliment (lignes déjà triées, plus récente d'abord). `null` si aucune prise
 * n'a de poids exploitable.
 */
function typicalGramsOf(rowsRecentFirst: NutritionHistoryRow[]): number | null {
  const grams: number[] = [];
  for (const row of rowsRecentFirst) {
    const g = resolveConsumedGrams(row);
    if (g != null && Number.isFinite(g) && g > 0) grams.push(g);
    if (grams.length >= HABIT_RULES.quantitySample) break;
  }
  return grams.length > 0 ? median(grams) : null;
}

/**
 * Quantité habituelle (grammes) de chaque aliment, tous repas confondus.
 * Clé : `foodKey(nom)`.
 */
export function computeTypicalGrams(rows: ReadonlyArray<NutritionHistoryRow>): Map<string, number> {
  const byFood = new Map<string, NutritionHistoryRow[]>();
  for (const row of [...rows].sort(byRecency)) {
    const key = foodKey(row.name);
    if (!key) continue;
    const list = byFood.get(key);
    if (list) list.push(row);
    else byFood.set(key, [row]);
  }
  const out = new Map<string, number>();
  for (const [key, list] of byFood) {
    const g = typicalGramsOf(list);
    if (g != null) out.set(key, g);
  }
  return out;
}

/**
 * Ligne prête à réinsérer pour un aliment habituel. Avec une valeur /100 g et
 * un poids habituel, les macros sont recalculés pour ce poids (même moteur que
 * la saisie manuelle). Sinon (favori, saisie libre sans poids), on reprend la
 * dernière prise telle quelle.
 */
function buildEntry(latest: NutritionHistoryRow, grams: number | null): HabitualEntry {
  const name = (latest.name ?? "").trim();
  if (grams != null && hasPer100(latest)) {
    const calc = calculateNutritionFromGrams(grams, {
      calories: latest.base_calories,
      proteins: latest.base_proteins,
      carbs: latest.base_carbs,
      fats: latest.base_fats,
    });
    if (!calc.error) {
      return {
        name,
        calories: calc.calories,
        proteins: calc.proteins,
        carbs: calc.carbs,
        fats: calc.fats,
        base_calories: latest.base_calories,
        base_proteins: latest.base_proteins,
        base_carbs: latest.base_carbs,
        base_fats: latest.base_fats,
        serving_count: 1,
        percentage_consumed: 100,
        consumed_quantity: calc.totalGrams,
        consumed_unit: "g",
        consumed_grams_per_unit: null,
      };
    }
  }
  return {
    name,
    calories: latest.calories,
    proteins: latest.proteins,
    carbs: latest.carbs,
    fats: latest.fats,
    base_calories: latest.base_calories,
    base_proteins: latest.base_proteins,
    base_carbs: latest.base_carbs,
    base_fats: latest.base_fats,
    serving_count: latest.serving_count ?? 1,
    percentage_consumed: 100,
    consumed_quantity: latest.consumed_quantity,
    consumed_unit: latest.consumed_unit,
    consumed_grams_per_unit: latest.consumed_grams_per_unit,
  };
}

/**
 * Le repas habituel de chaque créneau, d'après les `HABIT_RULES.recentMealDays`
 * dernières journées où ce créneau a été saisi. `excludeDate` retire une
 * journée du calcul (la journée affichée : ce qu'on y a déjà saisi ne doit
 * pas compter comme « habitude » pour elle-même).
 *
 * Un créneau sans habitude claire est simplement absent du résultat — on ne
 * propose jamais un repas « au hasard ».
 */
export function computeHabitualMeals(
  rows: ReadonlyArray<NutritionHistoryRow>,
  options: { excludeDate?: string } = {},
): HabitualMeals {
  const result: HabitualMeals = {};
  const sorted = rows
    .filter((r) => r.date !== options.excludeDate && foodKey(r.name) !== "")
    .sort(byRecency);

  for (const meal of MEAL_SLUGS) {
    const mealRows = sorted.filter((r) => r.meal === meal);
    const recentDates: string[] = [];
    for (const r of mealRows) {
      if (!recentDates.includes(r.date)) recentDates.push(r.date);
      if (recentDates.length >= HABIT_RULES.recentMealDays) break;
    }
    if (recentDates.length < HABIT_RULES.minMealDays) continue;
    const window = new Set(recentDates);

    // Par aliment : ses journées dans la fenêtre, et ses prises (récentes d'abord).
    const days = new Map<string, Set<string>>();
    const takes = new Map<string, NutritionHistoryRow[]>();
    for (const r of mealRows) {
      if (!window.has(r.date)) continue;
      const key = foodKey(r.name);
      const foodDays = days.get(key) ?? new Set<string>();
      foodDays.add(r.date);
      days.set(key, foodDays);
      const foodTakes = takes.get(key) ?? [];
      foodTakes.push(r);
      takes.set(key, foodTakes);
    }

    const threshold = Math.max(
      HABIT_RULES.minItemDays,
      Math.ceil(recentDates.length * HABIT_RULES.minShare),
    );
    const items: HabitualItem[] = [];
    for (const [key, d] of days) {
      const list = takes.get(key);
      if (d.size < threshold || !list || list.length === 0) continue;
      const grams = hasPer100(list[0]) ? typicalGramsOf(list) : null;
      items.push({ key, days: d.size, grams, entry: buildEntry(list[0], grams) });
    }
    if (items.length === 0) continue;

    items.sort((a, b) => b.days - a.days || a.key.localeCompare(b.key));
    const totals = items.reduce(
      (acc, it) => ({
        calories: acc.calories + (it.entry.calories ?? 0),
        proteins: acc.proteins + (it.entry.proteins ?? 0),
        carbs: acc.carbs + (it.entry.carbs ?? 0),
        fats: acc.fats + (it.entry.fats ?? 0),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 },
    );
    result[meal] = {
      meal,
      mealDays: recentDates.length,
      items,
      totals: {
        calories: Math.round(totals.calories),
        proteins: Math.round(totals.proteins * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fats: Math.round(totals.fats * 10) / 10,
      },
    };
  }
  return result;
}
