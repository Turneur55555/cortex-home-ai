// Contrats communs de l'import de recettes — partagés par toutes les sources
// futures (instagram aujourd'hui ; tiktok/youtube-shorts/local-video/photo/
// recipe-url demain). Chaque source expose un `SourceHandler.run()` qui
// retourne le même contrat `RecipeExtraction` — l'edge function
// `recipe-import/index.ts` ne connaît que ce contrat, jamais les détails
// d'une source précise.
//
// Pipeline (voir instagram-provider.ts / recipe-parser.ts / nutrition-engine.ts
// / recipe-db.ts) :
//   Provider (Content Extraction) -> Recipe Parser -> Nutrition Engine -> Database
//
// Miroir volontaire de src/lib/nutrition/recipeImport/types.ts (frontend) —
// les deux runtimes (Deno edge / navigateur) ne partagent pas de bundler,
// donc le contrat est dupliqué comme pour meal-items.ts (MealItem).

export type RecipeSourceKind =
  | "instagram"
  | "tiktok"
  | "youtube-shorts"
  | "local-video"
  | "photo"
  | "recipe-url";

/** Liste fermée alignée sur les rayons de courses (regroupement de la liste de courses). */
export const INGREDIENT_CATEGORIES = [
  "Fruits et légumes",
  "Viandes",
  "Poissons",
  "Produits laitiers",
  "Épicerie",
  "Surgelés",
  "Boissons",
  "Divers",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export interface RecipeIngredientExtraction {
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  /** Rayon de courses — best-effort IA, `null` si non déterminable (repli côté client). */
  category: IngredientCategory | null;
}

export interface RecipeMacrosExtraction {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
}

/** Tags produit — l'IA choisit parmi cette liste fermée (voir RECIPE_TOOL, recipe-parser.ts). */
export const RECIPE_TAGS = [
  "High Protein",
  "Healthy",
  "Meal Prep",
  "Low Carb",
  "Vegetarian",
  "Vegan",
  "Dessert",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Spicy",
  "Quick Recipe",
] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

export interface RecipeExtraction {
  title: string;
  imageUrl: string | null;
  servings: number;
  confidence: number;
  perServing: RecipeMacrosExtraction;
  ingredients: RecipeIngredientExtraction[];
  notes: string;
  /** Légende/description ORIGINALE du post source (og:description) — distincte de `notes` (hypothèses de l'IA). */
  originalCaption: string | null;
  /** Résumé structuré généré par l'IA (principe, ingrédients clés, cuisson, points importants) — ne remplace jamais `originalCaption`. */
  aiSummary: string | null;
  /** @handle Instagram de l'auteur — best-effort (scraping public, pas d'API officielle), `null` si non détectable. */
  authorHandle: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Sous-ensemble de RECIPE_TAGS, générés par l'IA — reste modifiable côté utilisateur. */
  tags: string[];
}

export interface SourceHandler {
  kind: RecipeSourceKind;
  /** Valide + normalise l'URL/fichier reçu ; lève une `RecipeImportError("invalid_url", ...)` sinon. */
  validate(rawValue: string): string;
  /** Exécute le pipeline complet (cache miss uniquement) et retourne la fiche extraite. */
  run(value: string, env: { geminiApiKey: string; openaiApiKey: string | null }): Promise<RecipeExtraction>;
}

// ─── Erreurs typées — un code par famille de cause, pour un message précis ────
// côté utilisateur (voir RecipeImportSheet.tsx qui affiche `error.message`).

export type RecipeImportErrorCode =
  | "invalid_url"
  | "private_post"
  | "deleted_post"
  | "content_unavailable"
  | "instagram_rate_limited"
  | "timeout"
  | "ai_error"
  | "server_error";

export class RecipeImportError extends Error {
  code: RecipeImportErrorCode;
  constructor(code: RecipeImportErrorCode, message: string) {
    super(message);
    this.name = "RecipeImportError";
    this.code = code;
  }
}

// ─── Utilitaires numériques communs (mêmes bornes que meal-items.ts) ──────────

export function safeNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : fallback;
}

export function safeConfidence(v: unknown, fallback = 0.5): number {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export function toBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
