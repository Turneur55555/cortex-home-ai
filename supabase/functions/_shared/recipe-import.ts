// Pipeline d'import de recettes — partagé par toutes les sources futures
// (instagram aujourd'hui ; tiktok/youtube-shorts/local-video/photo/recipe-url
// demain). Chaque source expose un `SourceHandler.run()` qui retourne le même
// contrat `RecipeExtraction` — l'edge function `recipe-import/index.ts` ne
// connaît que ce contrat, jamais les détails d'une source précise.
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
  /** Valide + normalise l'URL/fichier reçu ; lève une erreur utilisateur sinon. */
  validate(rawValue: string): string;
  /** Exécute le pipeline complet et retourne la fiche extraite. */
  run(value: string, env: { geminiApiKey: string; openaiApiKey: string | null }): Promise<RecipeExtraction>;
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

// ─── Extraction des ingrédients/macros — schéma tool-calling partagé ──────────

export const RECIPE_TOOL = {
  type: "function",
  function: {
    name: "save_recipe",
    description: "Enregistrer la fiche recette reconstituée à partir du contenu analysé",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Nom du plat" },
        servings: { type: "number", description: "Nombre de portions du plat" },
        confidence: { type: "number", description: "Confiance globale de l'analyse, entre 0 et 1" },
        notes: {
          type: "string",
          description: "Hypothèses/approximations faites (quantités estimées, ingrédient incertain, etc.)",
        },
        ingredients: {
          type: "array",
          description: "Chaque ingrédient identifié séparément, avec sa quantité et sa masse estimée.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number", description: "Quantité dans l'unité affichée" },
              unit: { type: "string", description: "Unité affichée (g, cl, pièce, c. à soupe, ...)" },
              grams: { type: "number", description: "Masse normalisée en grammes (0 si non estimable)" },
            },
            required: ["name", "quantity", "unit", "grams"],
            additionalProperties: false,
          },
          minItems: 1,
        },
        per_serving: {
          type: "object",
          description: "Macros pour UNE SEULE portion",
          properties: {
            calories: { type: "number" },
            proteins: { type: "number", description: "Protéines en g" },
            carbs: { type: "number", description: "Glucides en g" },
            fats: { type: "number", description: "Lipides en g" },
            fiber: { type: "number", description: "Fibres en g" },
          },
          required: ["calories", "proteins", "carbs", "fats", "fiber"],
          additionalProperties: false,
        },
      },
      required: ["title", "servings", "ingredients", "per_serving"],
      additionalProperties: false,
    },
  },
} as const;

export const RECIPE_SYSTEM_PROMPT = `Tu es un nutritionniste expert qui reconstitue une fiche recette complète à partir du contenu d'un post de réseau social (image/miniature, légende, transcription audio si disponible).

Méthode :
1. Identifie le plat et son nombre de portions probable.
2. Liste CHAQUE ingrédient séparément (jamais un plat entier comme une seule entrée), avec sa quantité dans une unité naturelle (g, cl, pièce, c. à soupe...) et sa masse estimée en grammes.
3. Calcule les macros (kcal, protéines, glucides, lipides, fibres) pour UNE SEULE portion, cohérentes avec la somme des ingrédients divisée par le nombre de portions.
4. Si une source d'information manque (pas de transcription audio, légende vague), fais une estimation raisonnable à partir de ce qui est disponible et BAISSE le niveau de confiance en conséquence. N'invente jamais un ingrédient qui ne serait ni visible ni mentionné.
5. Résume dans "notes" les principales hypothèses ou approximations faites.

Retourne STRICTEMENT du JSON via tool calling. Tout le texte en FRANÇAIS.`;

interface ToolCallResponse {
  choices?: Array<{
    message?: { tool_calls?: Array<{ function: { arguments: string } }> };
  }>;
}

/** Parse la réponse Gemini (tool calling) vers le contrat brut avant sanitation. */
export function parseRecipeToolCall(aiJson: unknown): Record<string, unknown> | null {
  const calls = (aiJson as ToolCallResponse)?.choices?.[0]?.message?.tool_calls;
  if (!calls || calls.length === 0) return null;
  try {
    const parsed = JSON.parse(calls[0].function.arguments);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Nettoie la sortie brute de l'IA vers le contrat `RecipeExtraction` (bornes + typage). */
export function sanitizeRecipeExtraction(
  raw: Record<string, unknown>,
  fallbackImageUrl: string | null,
  confidencePenalty: number,
): RecipeExtraction {
  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const ingredients: RecipeIngredientExtraction[] = rawIngredients.slice(0, 40).map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    const grams = safeNum(i.grams, 0);
    return {
      name: typeof i.name === "string" && i.name.trim() ? i.name.trim().slice(0, 150) : "Ingrédient",
      quantity: safeNum(i.quantity, 1),
      unit: typeof i.unit === "string" && i.unit.trim() ? i.unit.trim().slice(0, 30) : "pièce",
      grams: grams > 0 ? grams : null,
    };
  });

  const ps = (raw.per_serving ?? {}) as Record<string, unknown>;
  const perServing: RecipeMacrosExtraction = {
    calories: safeNum(ps.calories),
    proteins: safeNum(ps.proteins),
    carbs: safeNum(ps.carbs),
    fats: safeNum(ps.fats),
    fiber: safeNum(ps.fiber),
  };

  const servings = Math.max(1, Math.round(safeNum(raw.servings, 1)) || 1);
  const confidence = safeConfidence(
    safeConfidence(raw.confidence, 0.6) * Math.max(0, Math.min(1, 1 - confidencePenalty)),
  );

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : "Recette importée",
    imageUrl: fallbackImageUrl,
    servings,
    confidence,
    perServing,
    ingredients: ingredients.length > 0 ? ingredients : [{ name: "Ingrédient", quantity: 1, unit: "pièce", grams: null }],
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 400) : "",
  };
}
