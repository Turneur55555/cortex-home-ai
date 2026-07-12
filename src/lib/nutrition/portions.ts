// Portion management — pur, zéro React.
// Source de vérité pour : parsing décimal FR/EN, presets, conversion en grammes,
// calcul des macros depuis une portion, persistance locale du dernier choix.

import type { FoodSuggestion } from "@/services/foodSuggestion";
import type { MacroValues } from "./macros";

// ─── Parsing décimal tolérant (FR « 33,5 » et EN « 33.5 ») ──────────────────

/**
 * Convertit une saisie utilisateur en nombre. Accepte virgule ou point,
 * espaces fines, signe. Retourne `null` si vide / invalide / NaN.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const cleaned = input
    .toString()
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
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

// ─── Portions ───────────────────────────────────────────────────────────────

export type PortionUnit =
  | "g"
  | "ml"
  | "scoop"
  | "unite"
  | "pot"
  | "tranche"
  | "sachet"
  | "cas"
  | "cac"
  | "bouteille"
  | "canette";

export interface PortionPreset {
  /** Libellé affiché ex. « 1 scoop », « 1/2 œuf » */
  label: string;
  /** Quantité dans l'unité (ex. 0.5 pour ½) */
  quantity: number;
  /** Unité affichée */
  unit: PortionUnit;
  /** Grammes/ml équivalents pour cette quantité */
  grams: number;
}

export interface PortionReference {
  /** Libellé singulier ex. « scoop », « œuf », « pot » */
  unitLabel: PortionUnit;
  /** Grammes/ml pour 1 unité (ex. 33 pour un scoop de whey) */
  gramsPerUnit: number;
  /** Plurialisation simple */
  unitLabelPlural?: string;
}

// ─── Détection heuristique de la portion par défaut ────────────────────────

interface HeuristicRule {
  test: RegExp;
  ref: PortionReference;
}

const HEURISTICS: HeuristicRule[] = [
  // Compléments protéinés
  { test: /\b(whey|protein(?:e|es)?|caseine|isolate|gainer|mass)\b/i, ref: { unitLabel: "scoop", gramsPerUnit: 30 } },
  // Œufs
  { test: /\b(oeuf|œuf|oeufs|œufs|egg|eggs)\b/i, ref: { unitLabel: "unite", gramsPerUnit: 55, unitLabelPlural: "unités" } },
  // Yaourts / fromage blanc
  { test: /\b(yaourt|yogurt|fromage blanc|skyr|petit suisse)\b/i, ref: { unitLabel: "pot", gramsPerUnit: 125 } },
  // Tranches (pain, jambon)
  { test: /\b(tranche|pain de mie|jambon|bacon)\b/i, ref: { unitLabel: "tranche", gramsPerUnit: 30 } },
  // Sachets
  { test: /\b(sachet|sachets|stick|barre|bar)\b/i, ref: { unitLabel: "sachet", gramsPerUnit: 25 } },
  // Fruits unitaires
  { test: /\b(banane|pomme|orange|poire|kiwi|peche|abricot|nectarine)\b/i, ref: { unitLabel: "unite", gramsPerUnit: 120, unitLabelPlural: "unités" } },
  // Boissons (ml)
  { test: /\b(lait|jus|soda|biere|vin|cafe|the|boisson)\b/i, ref: { unitLabel: "ml", gramsPerUnit: 1 } },
];

/** Retourne une portion de référence sensée pour un nom d'aliment. */
export function detectDefaultPortion(name: string | null | undefined): PortionReference | null {
  if (!name) return null;
  for (const { test, ref } of HEURISTICS) {
    if (test.test(name)) return ref;
  }
  return null;
}

/** Construit la liste de presets à afficher selon la référence. */
export function buildPresets(ref: PortionReference | null): PortionPreset[] {
  if (!ref) {
    return [
      { label: "50 g", quantity: 50, unit: "g", grams: 50 },
      { label: "100 g", quantity: 100, unit: "g", grams: 100 },
      { label: "150 g", quantity: 150, unit: "g", grams: 150 },
      { label: "200 g", quantity: 200, unit: "g", grams: 200 },
    ];
  }
  const u = ref.unitLabel;
  const g = ref.gramsPerUnit;
  const plural = ref.unitLabelPlural ?? `${u}s`;
  if (u === "ml") {
    return [
      { label: "100 ml", quantity: 100, unit: "ml", grams: 100 },
      { label: "200 ml", quantity: 200, unit: "ml", grams: 200 },
      { label: "250 ml", quantity: 250, unit: "ml", grams: 250 },
      { label: "330 ml", quantity: 330, unit: "ml", grams: 330 },
    ];
  }
  return [
    { label: `½ ${u}`, quantity: 0.5, unit: u, grams: g * 0.5 },
    { label: `1 ${u}`, quantity: 1, unit: u, grams: g },
    { label: `2 ${plural}`, quantity: 2, unit: u, grams: g * 2 },
    { label: `3 ${plural}`, quantity: 3, unit: u, grams: g * 3 },
  ];
}

// ─── Calcul nutritionnel ────────────────────────────────────────────────────

export interface CalcInput {
  /** Quantité (peut être string utilisateur, virgule acceptée) */
  quantity: number | string;
  /** Unité saisie ("g", "ml", "scoop", etc.) */
  unit: PortionUnit;
  /** Référence de portion (si l'unité n'est pas g/ml) */
  reference?: PortionReference | null;
  /** Valeurs pour 100 g/ml */
  per100g: {
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
    fiber?: number | null;
  };
}

export interface CalcResult extends MacroValues {
  /** Grammes totaux dérivés de la saisie */
  totalGrams: number;
  fiber: number | null;
  /** Erreur explicite si la saisie n'est pas convertible */
  error?: string;
}

/**
 * Calcule calories + macros pour une portion utilisateur.
 * Fonction unique utilisée partout (recherche, scan, IA, manuel).
 */
export function calculateNutritionFromPortion(input: CalcInput): CalcResult {
  const qty = parseDecimal(input.quantity);
  const empty: CalcResult = {
    calories: null, proteins: null, carbs: null, fats: null,
    fiber: null, totalGrams: 0,
  };
  if (qty == null) return { ...empty, error: "Quantité invalide" };
  if (qty <= 0) return { ...empty, error: "La quantité doit être supérieure à 0" };

  let grams: number;
  if (input.unit === "g" || input.unit === "ml") {
    grams = qty;
  } else if (input.reference && input.reference.gramsPerUnit > 0) {
    grams = qty * input.reference.gramsPerUnit;
  } else {
    return { ...empty, error: `Conversion impossible pour l'unité « ${input.unit} »` };
  }

  const ratio = grams / 100;
  const r0 = (v: number | null | undefined) =>
    v != null ? Math.round(v * ratio) : null;
  const r1 = (v: number | null | undefined) =>
    v != null ? Math.round(v * ratio * 10) / 10 : null;

  return {
    totalGrams: Math.round(grams * 10) / 10,
    calories: r0(input.per100g.calories),
    proteins: r1(input.per100g.proteins),
    carbs: r1(input.per100g.carbs),
    fats: r1(input.per100g.fats),
    fiber: r1(input.per100g.fiber ?? null),
  };
}

// ─── Persistance du dernier choix de portion (localStorage) ────────────────

const LS_PREFIX = "cortex.portion.last.v1:";

export interface SavedPortion {
  quantity: number;
  unit: PortionUnit;
  gramsPerUnit?: number;
  unitLabelPlural?: string;
}

function keyFor(food: { id?: string | null; name?: string | null } | string): string {
  const raw = typeof food === "string" ? food : (food.id || food.name || "");
  return LS_PREFIX + raw.toLowerCase().trim();
}

export function loadSavedPortion(food: Parameters<typeof keyFor>[0]): SavedPortion | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(food));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPortion;
    if (typeof parsed?.quantity === "number" && typeof parsed?.unit === "string") {
      return parsed;
    }
  } catch {/* noop */}
  return null;
}

export function saveLastPortion(
  food: Parameters<typeof keyFor>[0],
  portion: SavedPortion,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(food), JSON.stringify(portion));
  } catch {/* quota — silencieux */}
}

// ─── Helper pour transformer un FoodSuggestion en CalcInput.per100g ───────

export function per100FromFood(food: FoodSuggestion) {
  return {
    calories: food.calories,
    proteins: food.proteins,
    carbs: food.carbs,
    fats: food.fats,
  };
}
