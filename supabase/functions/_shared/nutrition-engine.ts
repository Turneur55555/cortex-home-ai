// Étape "Nutrition Engine" du pipeline : reçoit le JSON brut du Recipe Parser
// et le contexte de qualité des signaux (transcript/légende/image
// disponibles ou non) et produit le contrat final `RecipeExtraction` — bornes
// numériques, valeurs par défaut, et score de confiance final. Aucun appel
// réseau ici : logique pure, testable indépendamment du provider/parser.
import {
  INGREDIENT_CATEGORIES,
  RECIPE_TAGS,
  safeConfidence,
  safeNum,
  type IngredientCategory,
  type RecipeExtraction,
  type RecipeIngredientExtraction,
  type RecipeMacrosExtraction,
} from "./recipe-import.ts";

export interface SignalQuality {
  hasTranscript: boolean;
  hasCaption: boolean;
  hasImage: boolean;
}

/** Contenu propre au provider, non issu de l'IA — recopié tel quel dans la fiche finale. */
export interface PassthroughContent {
  originalCaption: string | null;
  authorHandle: string | null;
}

/** Pénalité de confiance cumulée selon les signaux manquants. */
function confidencePenalty(signals: SignalQuality): number {
  let penalty = 0;
  if (!signals.hasTranscript) penalty += 0.15;
  if (!signals.hasCaption) penalty += 0.1;
  if (!signals.hasImage) penalty += 0.25;
  return penalty;
}

/** Minutes bornées 0..600, `null` si absent/non détectable (0 ou invalide côté IA). */
function safeMinutes(v: unknown): number | null {
  const n = safeNum(v, 0);
  return n > 0 && n <= 600 ? Math.round(n) : null;
}

/** Rayon de courses IA, s'il fait partie de la liste fermée — `null` sinon (repli client). */
function sanitizeCategory(v: unknown): IngredientCategory | null {
  return typeof v === "string" && (INGREDIENT_CATEGORIES as readonly string[]).includes(v)
    ? (v as IngredientCategory)
    : null;
}

/** Ne garde que les tags de la liste fermée, dédupliqués, max 5. */
function sanitizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set<string>(RECIPE_TAGS);
  const seen = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string") continue;
    if (allowed.has(t) && !seen.has(t)) seen.add(t);
    if (seen.size >= 5) break;
  }
  return [...seen];
}

/** Nettoie la sortie brute de l'IA vers le contrat `RecipeExtraction` (bornes + typage). */
export function computeRecipeExtraction(
  raw: Record<string, unknown>,
  fallbackImageUrl: string | null,
  signals: SignalQuality,
  passthrough: PassthroughContent,
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
      category: sanitizeCategory(i.category),
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
  const penalty = confidencePenalty(signals);
  const confidence = safeConfidence(safeConfidence(raw.confidence, 0.6) * Math.max(0, Math.min(1, 1 - penalty)));

  const { originalCaption, authorHandle } = passthrough;

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : "Recette importée",
    imageUrl: fallbackImageUrl,
    servings,
    confidence,
    perServing,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Ingrédient", quantity: 1, unit: "pièce", grams: null, category: null }],
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 400) : "",
    originalCaption: originalCaption && originalCaption.trim() ? originalCaption.trim().slice(0, 2200) : null,
    aiSummary: typeof raw.ai_summary === "string" && raw.ai_summary.trim() ? raw.ai_summary.trim().slice(0, 1200) : null,
    authorHandle: authorHandle && authorHandle.trim() ? authorHandle.trim().slice(0, 60) : null,
    prepMinutes: safeMinutes(raw.prep_minutes),
    cookMinutes: safeMinutes(raw.cook_minutes),
    tags: sanitizeTags(raw.tags),
  };
}
