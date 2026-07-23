// Journal alimentaire — poids en grammes, unique unité de saisie/calcul/affichage.
// Remplace lib/nutrition/portions.ts (mode "portion" supprimé du domaine journal).
//
// Le calcul macro canonique reste computeMacros() de ./macros (seul moteur,
// testé) — ce module l'entoure de parsing, de presets « poids suggérés » et
// de persistance locale. Aucune notion d'unité n'est exposée à l'UI : les
// données food_servings / heuristiques par nom ne servent qu'à suggérer des
// grammages pertinents (ex. 33 g pour une whey), jamais un sélecteur de mode.

import { computeMacros, type MacroValues } from "./macros";
import type { FoodSuggestion } from "@/services/foodSuggestion";

// ─── Parsing décimal tolérant (FR « 33,5 » et EN « 33.5 ») ──────────────────

export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const cleaned = input.toString().trim().replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Formatage léger pour réinjecter dans un input contrôlé. */
export function formatDecimal(value: number | null | undefined, maxFrac = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10 ** maxFrac) / 10 ** maxFrac;
  return String(rounded);
}

// ─── Presets de poids suggérés (grammes uniquement) ────────────────────────

export interface WeightPreset {
  /** Libellé affiché — toujours en grammes, ex. « 33 g » */
  label: string;
  grams: number;
  /** Indice contextuel optionnel, ex. « 1 scoop » — jamais un mode sélectionnable. */
  hint?: string;
}

interface GramsHeuristic {
  test: RegExp;
  gramsPerServing: number;
  hint: string;
}

const HEURISTICS: GramsHeuristic[] = [
  {
    test: /\b(whey|protein(?:e|es)?|caseine|isolate|gainer|mass)\b/i,
    gramsPerServing: 30,
    hint: "1 scoop",
  },
  { test: /\b(oeuf|œuf|oeufs|œufs|egg|eggs)\b/i, gramsPerServing: 55, hint: "1 œuf" },
  {
    test: /\b(yaourt|yogurt|fromage blanc|skyr|petit suisse)\b/i,
    gramsPerServing: 125,
    hint: "1 pot",
  },
  { test: /\b(tranche|pain de mie|jambon|bacon)\b/i, gramsPerServing: 30, hint: "1 tranche" },
  { test: /\b(sachet|sachets|stick|barre|bar)\b/i, gramsPerServing: 25, hint: "1 sachet" },
  {
    test: /\b(banane|pomme|orange|poire|kiwi|peche|abricot|nectarine)\b/i,
    gramsPerServing: 120,
    hint: "1 fruit",
  },
  {
    test: /\b(lait|jus|soda|biere|vin|cafe|the|boisson)\b/i,
    gramsPerServing: 200,
    hint: "1 verre",
  },
];

/** Grammage suggéré pour une portion usuelle, dérivé du nom (heuristique). */
function suggestGramsFromName(
  name: string | null | undefined,
): { grams: number; hint: string } | null {
  if (!name) return null;
  for (const { test, gramsPerServing, hint } of HEURISTICS) {
    if (test.test(name)) return { grams: gramsPerServing, hint };
  }
  return null;
}

/**
 * Construit les chips « poids suggéré » pour un aliment — toujours en
 * grammes. Utilise en priorité le grammage officiel du catalogue
 * (food_servings, via FoodSuggestion.default_serving), sinon une heuristique
 * par nom, sinon des paliers génériques.
 */
export function buildGramPresets(
  food: Pick<FoodSuggestion, "name" | "default_serving">,
): WeightPreset[] {
  const ds = food.default_serving;
  if (ds && ds.grams > 0) {
    const one = Math.round(ds.grams);
    return [
      { label: `${Math.round(one / 2)} g`, grams: Math.round(one / 2) },
      { label: `${one} g`, grams: one, hint: ds.label },
      { label: `${one * 2} g`, grams: one * 2 },
      { label: "100 g", grams: 100 },
    ];
  }
  const suggestion = suggestGramsFromName(food.name);
  if (suggestion) {
    const g = suggestion.grams;
    return [
      { label: `${Math.round(g / 2)} g`, grams: Math.round(g / 2) },
      { label: `${g} g`, grams: g, hint: suggestion.hint },
      { label: `${g * 2} g`, grams: g * 2 },
      { label: `${g * 3} g`, grams: g * 3 },
    ];
  }
  return [
    { label: "50 g", grams: 50 },
    { label: "100 g", grams: 100 },
    { label: "150 g", grams: 150 },
    { label: "200 g", grams: 200 },
  ];
}

// ─── Calcul nutritionnel (grammes → macros) ────────────────────────────────

export interface Per100g {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  fiber?: number | null;
}

export interface WeightCalcResult extends MacroValues {
  totalGrams: number;
  fiber: number | null;
  error?: string;
}

/**
 * Calcule calories + macros pour un poids en grammes — unique fonction de
 * calcul du journal alimentaire (délègue à computeMacros, seul moteur testé).
 */
export function calculateNutritionFromGrams(
  quantity: number | string,
  per100g: Per100g,
): WeightCalcResult {
  const grams = parseDecimal(quantity);
  const empty: WeightCalcResult = {
    calories: null,
    proteins: null,
    carbs: null,
    fats: null,
    fiber: null,
    totalGrams: 0,
  };
  if (grams == null) return { ...empty, error: "Poids invalide" };
  if (grams <= 0) return { ...empty, error: "Le poids doit être supérieur à 0" };

  const macros = computeMacros(
    {
      "energy-kcal_100g": per100g.calories ?? undefined,
      proteins_100g: per100g.proteins ?? undefined,
      carbohydrates_100g: per100g.carbs ?? undefined,
      fat_100g: per100g.fats ?? undefined,
    },
    grams,
  );
  const fiberR1 =
    per100g.fiber != null ? Math.round(((per100g.fiber * grams) / 100) * 10) / 10 : null;

  return {
    totalGrams: Math.round(grams * 10) / 10,
    calories: macros.calories,
    proteins: macros.proteins,
    carbs: macros.carbs,
    fats: macros.fats,
    fiber: fiberR1,
  };
}

export function per100FromFood(food: FoodSuggestion): Per100g {
  return {
    calories: food.calories,
    proteins: food.proteins,
    carbs: food.carbs,
    fats: food.fats,
  };
}

// ─── Résolution du poids réel d'une ligne journal historique ──────────────

interface ConsumedLike {
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
  consumed_grams_per_unit?: number | null;
}

/**
 * Reconstruit le poids en grammes d'une ligne existante, y compris les
 * lignes historiques écrites avant la bascule « grammes uniquement »
 * (anciennes unités scoop/pot/tranche, ou ancien mode « portion »).
 * Retourne `null` si le poids réel est irrécupérable (aucune régression :
 * les macros affichés restent ceux déjà enregistrés, seule l'édition du
 * poids a besoin d'un point de départ).
 */
export function resolveConsumedGrams(entry: ConsumedLike): number | null {
  const q = entry.consumed_quantity;
  const u = entry.consumed_unit;
  if (q == null) return null;
  if (u == null || u === "g" || u === "ml") return q;
  if (entry.consumed_grams_per_unit && entry.consumed_grams_per_unit > 0) {
    return q * entry.consumed_grams_per_unit;
  }
  return null;
}

// ─── Persistance du dernier poids choisi (localStorage) ────────────────────

const LS_PREFIX = "cortex.weight.last.v1:";

function keyFor(food: { id?: string | null; name?: string | null } | string): string {
  const raw = typeof food === "string" ? food : food.id || food.name || "";
  return LS_PREFIX + raw.toLowerCase().trim();
}

export function loadSavedWeight(food: Parameters<typeof keyFor>[0]): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(food));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveLastWeight(food: Parameters<typeof keyFor>[0], grams: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(food), String(grams));
  } catch {
    /* quota — silencieux */
  }
}
