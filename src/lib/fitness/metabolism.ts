// Pure domain helpers for metabolic estimates (BMR/BMI).
// No React, no Supabase, no UI tokens.
//
// Le TDEE et la recommandation calorique NE vivent PLUS ici — voir
// lib/fitness/tdee.ts (TDEE modélisé Cortex-native, BMR+NEAT+EAT+TEF) et
// lib/fitness/calorieStrategy.ts (Phase 4A/4B, recommandation par objectif/
// rythme, seule source de vérité pour la recommandation calorique).
// L'ancien `computeTDEE` (multiplicateur d'activité classique) et
// `computeCalorieTarget` (±300 kcal fixes, floor 1200 non justifié) ont été
// retirés en Phase 4B : ils produisaient une recommandation concurrente,
// moins précise, jamais Cortex-native.

export type BiologicalSex = "homme" | "femme";

/** Type guard pour une valeur de sexe biologique brute (ex. colonne Supabase `string | null`). */
export function isBiologicalSex(value: unknown): value is BiologicalSex {
  return value === "homme" || value === "femme";
}

/**
 * Âge valide pour le profil métabolique — entier, borné comme la contrainte
 * `CHECK (age > 0 AND age < 130)` de la table `metabolic_profile`.
 */
export function isValidMetabolicAge(age: number): boolean {
  return Number.isInteger(age) && age > 0 && age < 130;
}

/**
 * Métabolisme de base (BMR), formule de Mifflin-St Jeor, kcal/jour.
 * Retourne null si une entrée est invalide.
 */
export function computeBMR(
  sex: BiologicalSex,
  age: number,
  weightKg: number,
  heightCm: number,
): number | null {
  if (![age, weightKg, heightCm].every((v) => Number.isFinite(v) && v > 0)) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "homme" ? base + 5 : base - 161);
}

/** IMC = poids (kg) / taille (m)². Retourne null si une entrée est invalide. */
export function computeBMI(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export type BMICategory = "insuffisance" | "normal" | "surpoids" | "obesite";

/** Catégorie OMS standard à partir de l'IMC. */
export function bmiCategory(bmi: number): BMICategory {
  if (bmi < 18.5) return "insuffisance";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "surpoids";
  return "obesite";
}
