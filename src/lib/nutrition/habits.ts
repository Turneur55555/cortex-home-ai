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
 * Règles de reconnaissance d'une habitude. Calibrées sur les données réelles
 * (révision du 06/11/2026, signalement de Nathan : « il manque l'harissa au
 * déjeuner et des fruits au goûter », puis « fais 5 fois, pas 10 »). Sur ses
 * 5 derniers repas de chaque sorte, elles retiennent poulet + riz + harissa au déjeuner, kiwi + banane + crispies au
 * goûter, caséine + Monster au petit-déjeuner, lait + whey en collation — et
 * ne proposent rien pour un dîner qui change tous les soirs.
 *
 * Deux défauts de la première version, corrigés :
 *   - un même aliment saisi sous deux noms (« Harissa » / « Harissa (sauce au
 *     piment), préemballée », « KIWI » / « Kiwi SunGold ») était compté comme
 *     deux aliments, chacun sous le seuil → `foodIdentity` les réunit ;
 *   - un repas a souvent DEUX formes (goûter fruits / goûter chocolat-café) :
 *     compter chaque aliment sur tous les repas noyait les compagnons d'une
 *     forme dans les jours de l'autre (banane 3 goûters sur 10, mais 3 sur 5
 *     des goûters « fruits ») → le repas habituel se construit autour de son
 *     aliment-pivot, avec ce qui l'accompagne.
 *
 * En clair : l'aliment qui revient le plus sur les 5 derniers repas (au moins
 * 3 fois), et ce qui revient au moins 3 fois avec lui.
 */
export const HABIT_RULES = {
  /** On ne regarde que les N dernières journées où ce repas a été saisi (l'habitude récente). */
  recentMealDays: 5,
  /** Il faut au moins ce nombre de journées pour parler d'habitude. */
  minMealDays: 3,
  /**
   * Le pivot doit figurer dans au moins cette part des journées regardées ; un
   * compagnon, dans au moins cette part des journées où le pivot figure.
   */
  minShare: 0.5,
  /** Pivot comme compagnon : au moins ce nombre de fois (jamais une habitude sur 2 repas). */
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
  /** Identité de l'aliment (`foodIdentity`), variantes de nom réunies. */
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

/**
 * Nom exact d'un aliment, sans casse ni espaces superflus. Sert au poids
 * habituel : « Riz blanc, cru » et « Riz blanc (cuit) » n'ont pas le même
 * poids, ils gardent chacun le leur.
 */
export function foodKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Identité d'un aliment pour reconnaître une HABITUDE : le nom sans accents,
 * sans ce qui est entre parenthèses et sans ce qui suit la première virgule
 * (« Harissa (sauce au piment), préemballée » → « harissa », « Riz blanc, cru »
 * → « riz blanc »). Deux saisies du même aliment sous deux libellés comptent
 * ainsi comme un seul aliment.
 */
export function foodIdentity(name: string | null | undefined): string {
  const base = foodKey(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0];
  return base.replace(/\s+/g, " ").trim();
}

/**
 * Réunit, dans un ensemble d'identités, un libellé court avec l'UNIQUE libellé
 * plus précis qui commence par lui (« kiwi » → « kiwi sungold »). Ambigu
 * (« riz » face à « riz blanc » et « riz a sushi ») : rien n'est réuni.
 */
export function mergeIdentityPrefixes(identities: Iterable<string>): Map<string, string> {
  const all = [...new Set(identities)];
  const out = new Map<string, string>();
  for (const id of all) {
    const longer = all.filter((other) => other !== id && other.startsWith(`${id} `));
    out.set(id, longer.length === 1 ? longer[0] : id);
  }
  return out;
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
 * Construction :
 *   1. chaque journée est réduite à l'ensemble de ses aliments (identités) ;
 *   2. le PIVOT est l'aliment le plus présent (à égalité : le plus récent), à
 *      condition d'être là au moins une fois sur deux et au moins 3 fois ;
 *   3. le repas habituel = le pivot + les aliments présents au moins 3 fois,
 *      et au moins une fois sur deux, dans les journées où le pivot figure.
 * Chaque aliment est repris sous son libellé le plus récent, avec le poids
 * habituel de CE libellé.
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
    .filter((r) => r.date !== options.excludeDate && foodIdentity(r.name) !== "")
    .sort(byRecency);

  for (const meal of MEAL_SLUGS) {
    const mealRows = sorted.filter((r) => r.meal === meal);
    const recentDates: string[] = [];
    for (const r of mealRows) {
      if (!recentDates.includes(r.date)) recentDates.push(r.date);
      if (recentDates.length >= HABIT_RULES.recentMealDays) break;
    }
    if (recentDates.length < HABIT_RULES.minMealDays) continue;
    const windowRows = mealRows.filter((r) => recentDates.includes(r.date));

    const identityOf = mergeIdentityPrefixes(windowRows.map((r) => foodIdentity(r.name)));
    const idOf = (r: NutritionHistoryRow) => {
      const raw = foodIdentity(r.name);
      return identityOf.get(raw) ?? raw;
    };

    // Par identité : ses journées, et ses prises (récentes d'abord).
    const days = new Map<string, Set<string>>();
    const takes = new Map<string, NutritionHistoryRow[]>();
    for (const r of windowRows) {
      const id = idOf(r);
      const foodDays = days.get(id) ?? new Set<string>();
      foodDays.add(r.date);
      days.set(id, foodDays);
      const foodTakes = takes.get(id) ?? [];
      foodTakes.push(r);
      takes.set(id, foodTakes);
    }
    // Rang de la dernière apparition (0 = le repas le plus récent) : départage
    // deux aliments aussi fréquents l'un que l'autre.
    const lastSeen = (d: ReadonlySet<string>) => recentDates.findIndex((date) => d.has(date));

    // 2. Le pivot.
    let pivot: { id: string; days: Set<string> } | null = null;
    for (const [id, d] of days) {
      if (d.size < HABIT_RULES.minItemDays) continue;
      if (d.size < recentDates.length * HABIT_RULES.minShare) continue;
      const better =
        !pivot ||
        d.size > pivot.days.size ||
        (d.size === pivot.days.size &&
          (lastSeen(d) < lastSeen(pivot.days) ||
            (lastSeen(d) === lastSeen(pivot.days) && id.localeCompare(pivot.id) < 0)));
      if (better) pivot = { id, days: d };
    }
    if (!pivot) continue;

    // 3. Le pivot et ce qui l'accompagne.
    const pivotDates = recentDates.filter((d) => pivot.days.has(d));
    const items: HabitualItem[] = [];
    for (const [id, d] of days) {
      const together = pivotDates.filter((date) => d.has(date)).length;
      if (together < HABIT_RULES.minItemDays) continue;
      if (together < pivotDates.length * HABIT_RULES.minShare) continue;
      const list = takes.get(id);
      if (!list || list.length === 0) continue;
      // Le libellé le plus récent, et le poids habituel de CE libellé — sur tout
      // l'historique de ce repas, pas seulement les journées regardées (deux
      // prises à 50 g et 25 g ne font pas une habitude à 37,5 g).
      const latest = list[0];
      const sameVariant = mealRows.filter((r) => foodKey(r.name) === foodKey(latest.name));
      const grams = hasPer100(latest) ? typicalGramsOf(sameVariant) : null;
      items.push({ key: id, days: d.size, grams, entry: buildEntry(latest, grams) });
    }
    // Affichage : le plus nourrissant d'abord (« Poulet · Riz · Harissa »).
    items.sort(
      (a, b) => (b.entry.calories ?? 0) - (a.entry.calories ?? 0) || a.key.localeCompare(b.key),
    );
    if (items.length === 0) continue;

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
