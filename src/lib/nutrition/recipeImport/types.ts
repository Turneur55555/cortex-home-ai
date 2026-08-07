/**
 * Import de recettes — contrats de domaine (zéro React, zéro couleur).
 *
 * L'objectif de cette abstraction est qu'une seule UI et un seul pipeline
 * servent toutes les sources : Instagram (V1), puis TikTok, YouTube Shorts,
 * vidéo locale, photo, ou URL de site de recettes. Ajouter une source =
 * ajouter un `RecipeImporter` dans le registre, rien d'autre.
 */

export type RecipeSourceKind =
  | "instagram"
  | "tiktok"
  | "youtube-shorts"
  | "local-video"
  | "photo"
  | "recipe-url";

/** Étape affichée pendant l'analyse. Les durées servent à la simulation V1. */
export interface ImportStage {
  key: string;
  label: string;
  /** Durée simulée en ms (ignorée quand le pipeline sera réel). */
  durationMs: number;
}

export interface ImportedIngredient {
  name: string;
  /** Quantité affichée (ex. 2). */
  quantity: number;
  /** Unité affichée (ex. "c. à soupe", "g", "pièce"). */
  unit: string;
  /** Masse normalisée en grammes quand elle est estimable. */
  grams: number | null;
}

export interface ImportedMacros {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
}

export interface ImportedRecipe {
  title: string;
  imageUrl: string | null;
  servings: number;
  /** Niveau de confiance global de l'analyse, entre 0 et 1. */
  confidence: number;
  /** Macros pour UNE portion. */
  perServing: ImportedMacros;
  ingredients: ImportedIngredient[];
  sourceKind: RecipeSourceKind;
  sourceUrl: string | null;
  /** Note libre issue de l'analyse (approximations, hypothèses). */
  notes?: string;
  /**
   * Id de la recette persistée côté serveur (`recipes`), quand le pipeline
   * l'a créée — `null` pour les sources encore simulées côté client. Permet
   * de réutiliser la recette déjà créée lors de l'ajout au journal, sans la
   * dupliquer.
   */
  recipeId: string | null;
}

export type ImportInput = { kind: "url"; value: string } | { kind: "file"; value: File };

export interface RecipeImporter {
  kind: RecipeSourceKind;
  /** Libellé produit (UI). */
  label: string;
  /** Une source non disponible est affichée comme « bientôt ». */
  available: boolean;
  /** Décide si cet importeur sait traiter l'entrée fournie. */
  canHandle(input: ImportInput): boolean;
  /** Étapes du pipeline, dans l'ordre. */
  stages(): ImportStage[];
  /** Exécute le pipeline. `onStage` est appelé au début de chaque étape. */
  run(input: ImportInput, onStage: (stageKey: string) => void): Promise<ImportedRecipe>;
}

/** Confiance -> libellé produit. */
export function confidenceLabel(confidence: number): "Faible" | "Moyenne" | "Élevée" {
  if (confidence >= 0.8) return "Élevée";
  if (confidence >= 0.55) return "Moyenne";
  return "Faible";
}

/** Macros totales de la recette (portions × macros par portion). */
export function totalMacros(recipe: ImportedRecipe): ImportedMacros {
  const s = recipe.servings > 0 ? recipe.servings : 1;
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    calories: Math.round(recipe.perServing.calories * s),
    proteins: r(recipe.perServing.proteins * s),
    carbs: r(recipe.perServing.carbs * s),
    fats: r(recipe.perServing.fats * s),
    fiber: r(recipe.perServing.fiber * s),
  };
}
