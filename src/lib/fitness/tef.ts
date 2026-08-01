// Pure domain logic for TEF (Thermic Effect of Food) — Phase 2C de la
// refonte Santé nutritionnelle. TEF ne représente QUE l'énergie dépensée
// pour digérer/absorber/métaboliser les nutriments consommés — jamais le
// BMR, l'EAT, le NEAT ni l'objectif calorique (ces métriques restent
// indépendantes tant que le TDEE ne les agrège pas dans une phase dédiée).
// No React, no Supabase, no UI tokens.

/**
 * Coefficients thermiques moyens par macronutriment — valeurs centrales
 * usuelles de la littérature nutritionnelle (protéines les plus coûteuses à
 * métaboliser, lipides les moins), PAS une mesure physiologique exacte.
 * Seul point de vérité : à ajuster ici si de meilleures valeurs sont
 * retenues, sans toucher au reste du code.
 */
export const TEF_COEFFICIENTS = {
  proteins: 0.25,
  carbs: 0.075,
  fats: 0.025,
} as const;

/** Énergie par gramme (règle d'Atwater), kcal/g. */
const KCAL_PER_GRAM = {
  proteins: 4,
  carbs: 4,
  fats: 9,
} as const;

export interface MacroGrams {
  proteins: number | null | undefined;
  carbs: number | null | undefined;
  fats: number | null | undefined;
}

export interface DailyTEF {
  totalKcal: number;
  proteinTEF: number;
  carbsTEF: number;
  fatTEF: number;
  method: "macros";
  confidence: "estimate";
}

/** Grammes valides uniquement — jamais de NaN/Infinity/négatif propagé. */
function safeGrams(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * TEF (Thermic Effect of Food) estimé à partir des macronutriments
 * RÉELLEMENT CONSOMMÉS (jamais des objectifs — voir useNutritionTotals().totals,
 * pas .remaining). Fonctionne pour n'importe quel jour : cette fonction ne
 * connaît pas de date, elle opère sur les totaux déjà agrégés par
 * l'appelant pour le jour demandé (useNutrition(date) + useNutritionTotals).
 *
 * Aucun repas enregistré ⇒ macros à 0 ⇒ TEF = 0 kcal (donnée réellement
 * présente, consommation nulle — jamais une valeur inventée).
 *
 * Limite connue et assumée (§5) : les calories totales d'un repas peuvent
 * différer de protéines×4 + glucides×4 + lipides×9 (fibres, alcool,
 * arrondis, données nutritionnelles incomplètes). Ce calcul ne tente
 * jamais de réattribuer cet écart à un macronutriment — seuls les grammes
 * de protéines/glucides/lipides réellement connus entrent dans le TEF.
 *
 * Cohérence garantie par construction : chaque sous-total est arrondi
 * individuellement, puis totalKcal = somme des sous-totaux déjà arrondis
 * (jamais un arrondi indépendant du total qui pourrait diverger du détail).
 */
export function computeTEF(macros: MacroGrams): DailyTEF {
  const proteinsG = safeGrams(macros.proteins);
  const carbsG = safeGrams(macros.carbs);
  const fatsG = safeGrams(macros.fats);

  const proteinTEF = Math.round(proteinsG * KCAL_PER_GRAM.proteins * TEF_COEFFICIENTS.proteins);
  const carbsTEF = Math.round(carbsG * KCAL_PER_GRAM.carbs * TEF_COEFFICIENTS.carbs);
  const fatTEF = Math.round(fatsG * KCAL_PER_GRAM.fats * TEF_COEFFICIENTS.fats);

  return {
    totalKcal: proteinTEF + carbsTEF + fatTEF,
    proteinTEF,
    carbsTEF,
    fatTEF,
    method: "macros",
    confidence: "estimate",
  };
}
