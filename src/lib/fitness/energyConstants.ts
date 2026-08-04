// Constantes énergétiques PARTAGÉES entre les moteurs qui convertissent une
// masse corporelle en équivalent calorique — un seul point de vérité,
// jamais dupliqué. No React, no Supabase.

/**
 * kcal ≈ équivalent énergétique d'1 kg de masse corporelle. Approximation
 * de départ (littérature historique, ~3500 kcal/lb ≈ 7700 kcal/kg) — PAS une
 * constante physiologique exacte (la composition du tissu perdu/gagné — gras
 * vs eau vs muscle — la fait varier réellement). Centralisée ici pour être
 * remplacée par un modèle plus fin plus tard sans dupliquer la valeur dans
 * chaque moteur qui la consomme (`adaptiveTdee.ts` Phase 3A, pour convertir
 * une tendance de poids lissée en dépense ; `calorieStrategy.ts` Phase 4A,
 * pour convertir un rythme de perte/prise de poids cible en déficit/surplus
 * calorique quotidien). Ne JAMAIS l'appliquer à une variation brute 24-48h —
 * uniquement à une tendance lissée ou à un rythme HEBDOMADAIRE cible.
 */
export const KCAL_PER_KG_BODY_MASS = 7700;
