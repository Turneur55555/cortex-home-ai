/**
 * Taxonomie Dressing (Phase 4.1) — logique pure, zéro import React.
 *
 * Source de vérité UNIQUE pour piloter le formulaire adaptatif d'ajout
 * d'une pièce : quels types précis (subcategory) proposer pour une
 * catégorie donnée, quels champs afficher dans la section
 * « Caractéristiques », et quel mode de taille utiliser. Le formulaire
 * (src/routes/_authenticated/dressing/ajouter.tsx) lit cette config au
 * lieu de coder un formulaire différent par vêtement.
 *
 * "usage" n'est jamais une catégorie principale (wardrobe_items.category
 * reste limité à top/bottom/outerwear/shoes/accessory) : c'est un attribut
 * multi-valué (Quotidien/Sport/Habillé/Baignade) porté par la colonne
 * `usage text[]`.
 */

export type WardrobeUiCategory = "tops" | "bottoms" | "outerwear" | "shoes" | "accessories";

/** Valeurs réelles acceptées par wardrobe_items_category_check. */
export const WARDROBE_DB_CATEGORY_BY_UI: Record<WardrobeUiCategory, string> = {
  tops: "top",
  bottoms: "bottom",
  outerwear: "outerwear",
  shoes: "shoes",
  accessories: "accessory",
};

export const WARDROBE_UI_CATEGORY_BY_DB: Record<string, WardrobeUiCategory> = {
  top: "tops",
  bottom: "bottoms",
  outerwear: "outerwear",
  shoes: "shoes",
  accessory: "accessories",
};

// ─── Usage (attribut, jamais une catégorie) ─────────────────────────────────

export type WardrobeUsage = "quotidien" | "sport" | "habille" | "baignade";

export const WARDROBE_USAGE_OPTIONS: Array<{ value: WardrobeUsage; label: string }> = [
  { value: "quotidien", label: "Quotidien" },
  { value: "sport", label: "Sport" },
  { value: "habille", label: "Habillé" },
  { value: "baignade", label: "Baignade" },
];

// ─── Manches (uniquement pertinent pour les hauts) ──────────────────────────

export type WardrobeSleeveLength = "sans_manches" | "courtes" | "longues";

export const WARDROBE_SLEEVE_LENGTH_OPTIONS: Array<{ value: WardrobeSleeveLength; label: string }> =
  [
    { value: "sans_manches", label: "Sans manches" },
    { value: "courtes", label: "Manches courtes" },
    { value: "longues", label: "Manches longues" },
  ];

// ─── Coupe et motif — vocabulaire partagé avec l'Edge Function Cortex Vision ─

export type WardrobeFit = "slim" | "ajustee" | "droite" | "regular" | "oversize" | "ample";

export const WARDROBE_FIT_OPTIONS: Array<{ value: WardrobeFit; label: string }> = [
  { value: "slim", label: "Slim" },
  { value: "ajustee", label: "Ajustée" },
  { value: "droite", label: "Droite" },
  { value: "regular", label: "Regular" },
  { value: "oversize", label: "Oversize" },
  { value: "ample", label: "Ample" },
];

export type WardrobePattern =
  | "uni"
  | "rayures"
  | "carreaux"
  | "imprime"
  | "logo"
  | "graphique"
  | "texture";

export const WARDROBE_PATTERN_OPTIONS: Array<{ value: WardrobePattern; label: string }> = [
  { value: "uni", label: "Uni" },
  { value: "rayures", label: "Rayures" },
  { value: "carreaux", label: "Carreaux" },
  { value: "imprime", label: "Imprimé" },
  { value: "logo", label: "Logo" },
  { value: "graphique", label: "Graphique" },
  { value: "texture", label: "Texturé" },
];

// ─── Type précis (subcategory) — vocabulaire contrôlé, par catégorie ───────

export interface WardrobeSubcategoryDef {
  /** Valeur canonique stockée dans wardrobe_items.subcategory. */
  value: string;
  label: string;
  category: WardrobeUiCategory;
  /** Usage proposé par défaut (ex: maillots de bain → Baignade). Reste modifiable. */
  defaultUsage?: WardrobeUsage[];
}

export const WARDROBE_SUBCATEGORIES: WardrobeSubcategoryDef[] = [
  // Hauts
  { value: "tshirt", label: "T-shirt", category: "tops" },
  { value: "polo", label: "Polo", category: "tops" },
  { value: "chemise", label: "Chemise", category: "tops" },
  { value: "sweat", label: "Sweat", category: "tops" },
  { value: "pull", label: "Pull", category: "tops" },
  { value: "cardigan", label: "Cardigan", category: "tops" },
  { value: "debardeur", label: "Débardeur", category: "tops" },
  { value: "haut_bikini", label: "Haut de bikini", category: "tops", defaultUsage: ["baignade"] },
  {
    value: "maillot_une_piece",
    label: "Maillot une pièce",
    category: "tops",
    defaultUsage: ["baignade"],
  },

  // Bas
  { value: "jean", label: "Jean", category: "bottoms" },
  { value: "pantalon", label: "Pantalon", category: "bottoms" },
  { value: "chino", label: "Chino", category: "bottoms" },
  { value: "jogging", label: "Jogging", category: "bottoms" },
  { value: "jupe", label: "Jupe", category: "bottoms" },
  { value: "legging", label: "Legging", category: "bottoms" },
  { value: "short", label: "Short", category: "bottoms" },
  { value: "short_bain", label: "Short de bain", category: "bottoms", defaultUsage: ["baignade"] },
  { value: "boxer_bain", label: "Boxer de bain", category: "bottoms", defaultUsage: ["baignade"] },
  { value: "slip_bain", label: "Slip de bain", category: "bottoms", defaultUsage: ["baignade"] },
  { value: "bas_bikini", label: "Bas de bikini", category: "bottoms", defaultUsage: ["baignade"] },

  // Vestes
  { value: "veste", label: "Veste", category: "outerwear" },
  { value: "blouson", label: "Blouson", category: "outerwear" },
  { value: "manteau", label: "Manteau", category: "outerwear" },
  { value: "parka", label: "Parka", category: "outerwear" },
  { value: "doudoune", label: "Doudoune", category: "outerwear" },

  // Chaussures
  { value: "sneakers", label: "Sneakers", category: "shoes" },
  { value: "running", label: "Running", category: "shoes", defaultUsage: ["sport"] },
  { value: "mocassins", label: "Mocassins", category: "shoes" },
  { value: "bottines", label: "Bottines", category: "shoes" },
  { value: "sandales", label: "Sandales", category: "shoes" },
  { value: "ville", label: "Chaussures de ville", category: "shoes", defaultUsage: ["habille"] },

  // Accessoires
  { value: "casquette", label: "Casquette", category: "accessories" },
  { value: "bonnet", label: "Bonnet", category: "accessories" },
  { value: "ceinture", label: "Ceinture", category: "accessories" },
  { value: "montre", label: "Montre", category: "accessories" },
  { value: "sac", label: "Sac", category: "accessories" },
  { value: "echarpe", label: "Écharpe", category: "accessories" },
];

export function getSubcategoriesForCategory(
  category: WardrobeUiCategory,
): WardrobeSubcategoryDef[] {
  return WARDROBE_SUBCATEGORIES.filter((s) => s.category === category);
}

export function findSubcategory(value: string | null | undefined): WardrobeSubcategoryDef | null {
  if (!value) return null;
  return WARDROBE_SUBCATEGORIES.find((s) => s.value === value) ?? null;
}

// ─── Section « Caractéristiques » — champs affichés par catégorie ─────────

export interface WardrobeCharacteristicsConfig {
  sleeveLength: boolean;
  fit: boolean;
  material: boolean;
  pattern: boolean;
  usage: boolean;
}

const CHARACTERISTICS_BY_CATEGORY: Record<WardrobeUiCategory, WardrobeCharacteristicsConfig> = {
  tops: { sleeveLength: true, fit: true, material: true, pattern: true, usage: true },
  bottoms: { sleeveLength: false, fit: true, material: true, pattern: true, usage: true },
  outerwear: { sleeveLength: false, fit: true, material: true, pattern: true, usage: true },
  shoes: { sleeveLength: false, fit: false, material: true, pattern: false, usage: true },
  accessories: { sleeveLength: false, fit: false, material: true, pattern: false, usage: true },
};

export function getCharacteristicsConfig(
  category: WardrobeUiCategory,
): WardrobeCharacteristicsConfig {
  return CHARACTERISTICS_BY_CATEGORY[category];
}

/** true si au moins un champ de la section « Caractéristiques » est pertinent. */
export function hasAnyCharacteristic(config: WardrobeCharacteristicsConfig): boolean {
  return config.sleeveLength || config.fit || config.material || config.pattern || config.usage;
}

// ─── Taille adaptative ───────────────────────────────────────────────────

export type WardrobeSizeMode = "letter" | "bottoms" | "shoes" | "unique";

export interface WardrobeSizeConfig {
  mode: WardrobeSizeMode;
  /** Options prédéfinies proposées (toujours complétées par une saisie "Personnalisée"). */
  options: string[];
  allowCustom: boolean;
}

const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const BOTTOM_SIZES = [
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "W28",
  "W30",
  "W32",
  "W34",
  "W36",
  "W38",
  "W40",
];
/** Pointures 35 → 48 par pas de 0.5. */
const SHOE_SIZES = Array.from({ length: 27 }, (_, i) => {
  const value = 35 + i * 0.5;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
});

const SIZE_CONFIG_BY_CATEGORY: Record<WardrobeUiCategory, WardrobeSizeConfig> = {
  tops: { mode: "letter", options: LETTER_SIZES, allowCustom: true },
  outerwear: { mode: "letter", options: LETTER_SIZES, allowCustom: true },
  bottoms: { mode: "bottoms", options: BOTTOM_SIZES, allowCustom: true },
  shoes: { mode: "shoes", options: SHOE_SIZES, allowCustom: true },
  accessories: { mode: "unique", options: ["Taille unique"], allowCustom: true },
};

export function getSizeConfig(category: WardrobeUiCategory): WardrobeSizeConfig {
  return SIZE_CONFIG_BY_CATEGORY[category];
}
