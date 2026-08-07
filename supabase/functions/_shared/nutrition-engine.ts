// Étape "Nutrition Engine" du pipeline : reçoit le JSON brut du Recipe Parser
// et le contexte de qualité des signaux (transcript/légende/image
// disponibles ou non) et produit le contrat final `RecipeExtraction` — bornes
// numériques, valeurs par défaut, et score de confiance final. Aucun appel
// réseau ici : logique pure, testable indépendamment du provider/parser.
import {
  safeConfidence,
  safeNum,
  type RecipeExtraction,
  type RecipeIngredientExtraction,
  type RecipeMacrosExtraction,
} from "./recipe-import.ts";

export interface SignalQuality {
  hasTranscript: boolean;
  hasCaption: boolean;
  hasImage: boolean;
}

/** Pénalité de confiance cumulée selon les signaux manquants. */
function confidencePenalty(signals: SignalQuality): number {
  let penalty = 0;
  if (!signals.hasTranscript) penalty += 0.15;
  if (!signals.hasCaption) penalty += 0.1;
  if (!signals.hasImage) penalty += 0.25;
  return penalty;
}

/** Nettoie la sortie brute de l'IA vers le contrat `RecipeExtraction` (bornes + typage). */
export function computeRecipeExtraction(
  raw: Record<string, unknown>,
  fallbackImageUrl: string | null,
  signals: SignalQuality,
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
  const penalty = confidencePenalty(signals);
  const confidence = safeConfidence(safeConfidence(raw.confidence, 0.6) * Math.max(0, Math.min(1, 1 - penalty)));

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
