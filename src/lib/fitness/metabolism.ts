// Pure domain helpers for metabolic estimates (BMR/TDEE/BMI).
// No React, no Supabase, no UI tokens.

export type BiologicalSex = "homme" | "femme";

export const ACTIVITY_LEVELS = [
  { value: "1.2", label: "Sédentaire (peu ou pas d'exercice)" },
  { value: "1.375", label: "Légèrement actif (1-3 j/sem)" },
  { value: "1.55", label: "Modérément actif (3-5 j/sem)" },
  { value: "1.725", label: "Très actif (6-7 j/sem)" },
  { value: "1.9", label: "Extrêmement actif (sport + travail physique)" },
] as const;

export const GOAL_DELTAS = [
  { value: "seche", label: "Sèche (−300 kcal)", delta: -300 },
  { value: "maintien", label: "Maintien", delta: 0 },
  { value: "prise", label: "Prise de masse (+300 kcal)", delta: 300 },
] as const;

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

/**
 * Dépense quotidienne estimée (TDEE) = BMR × niveau d'activité, avec un
 * ajustement d'objectif optionnel (déficit/surplus), kcal/jour.
 */
export function computeTDEE(bmr: number, activityLevel: number, goalDeltaKcal = 0): number {
  return Math.max(1200, Math.round(bmr * activityLevel) + goalDeltaKcal);
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
