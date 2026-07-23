// Contrat commun aux edge functions d'analyse de repas (scan-meal, parse-meal-text).
//
// Chaque aliment détecté par l'IA doit TOUJOURS porter son poids estimé
// (grams), en plus des macros — jamais uniquement les macros seules. C'est
// ce poids qui devient le poids de référence du journal côté client
// (consumed_quantity / consumed_unit = "g"), tant que l'utilisateur ne le
// modifie pas. Avant l'introduction de ce contrat, le poids était bien
// estimé en interne par le modèle (étape de raisonnement) mais jamais
// exposé dans le schéma de sortie — donc systématiquement perdu.

export interface MealItem {
  name: string;
  grams: number;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

export interface MealAnalysisResult {
  items: MealItem[];
  meal?: string;
  confidence?: number;
}

/** Fragment de schéma JSON (tool calling) commun à un aliment détecté. */
export const MEAL_ITEM_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Nom de l'aliment avec quantité si pertinent",
    },
    grams: {
      type: "number",
      description:
        "Masse estimée en grammes pour cet aliment — celle utilisée pour calculer ses macros. Sera enregistrée comme poids de référence.",
    },
    calories: { type: "number", description: "kcal pour cette masse estimée" },
    proteins: { type: "number", description: "Protéines en g" },
    carbs: { type: "number", description: "Glucides en g" },
    fats: { type: "number", description: "Lipides en g" },
  },
  required: ["name", "grams", "calories", "proteins", "carbs", "fats"],
  additionalProperties: false,
} as const;

/** Nombre borné ≥ 0, 1 décimale — sanitize commun des valeurs numériques IA. */
export function safeNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : fallback;
}

/** Nettoie un item brut (issu du parsing IA) vers le contrat MealItem. */
export function sanitizeMealItem(item: unknown): MealItem {
  const it = (item ?? {}) as Record<string, unknown>;
  return {
    name: typeof it.name === "string" ? it.name.slice(0, 200) : "Aliment",
    grams: safeNum(it.grams),
    calories: safeNum(it.calories),
    proteins: safeNum(it.proteins),
    carbs: safeNum(it.carbs),
    fats: safeNum(it.fats),
  };
}
