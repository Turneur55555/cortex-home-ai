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

export interface RecipeIngredientExtraction {
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
}

export interface RecipeMacrosExtraction {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
}

export interface RecipeExtraction {
  title: string;
  imageUrl: string | null;
  servings: number;
  confidence: number;
  perServing: RecipeMacrosExtraction;
  ingredients: RecipeIngredientExtraction[];
  notes: string;
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
