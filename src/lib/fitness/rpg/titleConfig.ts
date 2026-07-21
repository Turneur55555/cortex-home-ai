// ============================================================
// Progression principale — configuration centralisée (domaine pur, zéro
// React, zéro import serveur).
//
// SEULE source de vérité pour : les 6 Titres (réutilise `RANK_TIERS` —
// mêmes noms/couleurs que le Rang par exercice, par cohérence visuelle,
// mais AUCUN lien de calcul avec lui), les 30 Grades nommés (5 par
// Titre), et la table des seuils XP.
//
// Rééquilibrer la progression = éditer `XP_THRESHOLDS` ci-dessous, jamais
// le moteur (`titleProgress.ts`). Table de seuils volontairement statique
// (pas de formule) : chaque palier peut être ajusté individuellement selon
// le vécu réel des joueurs, sans recalcul en cascade.
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";

export const LEVELS_PER_TITLE = 5;
export const TOTAL_TIERS = RANK_TIERS.length * LEVELS_PER_TITLE; // 30

/** Les 5 Grades nommés de chaque Titre, dans l'ordre de progression. */
export const GRADE_NAMES_BY_TITLE: Record<
  RankKey,
  readonly [string, string, string, string, string]
> = {
  mortel: ["Éveillé", "Initié", "Aguerri", "Accompli", "Émérite"],
  guerrier: ["Aspirant", "Vétéran", "Redoutable", "Inflexible", "Invaincu"],
  heros: ["Célèbre", "Admiré", "Glorieux", "Légendaire", "Mythique"],
  titan: ["Colossal", "Implacable", "Dominateur", "Inébranlable", "Souverain"],
  olympien: ["Exalté", "Ascendant", "Sublime", "Éternel", "Divin"],
  primordial: ["Originel", "Ancestral", "Suprême", "Absolu", "Omniscient"],
};

/**
 * XP cumulée nécessaire pour ENTRER dans le palier i (0..29). Palier 0
 * (Mortel — Éveillé) = 0 XP. Valeurs figées, éditables individuellement —
 * aucune formule.
 *
 * Recalibrées intégralement en P1.8, à partir de zéro (aucun héritage des
 * seuils précédents), sur l'économie XP réduite à 5 familles (P1.7) :
 * workout_muscu / workout_support / streak / exercise_progress_record /
 * exercise_rank_up. Simulation sur 4 profils (Débutant 2 séances/sem →
 * Extrême quasi quotidien) de 1 semaine à 5 ans :
 *  - Débutant  : Héros III (1 an) → Olympien II (5 ans)
 *  - Régulier  : Héros V (1 an) → Primordial I (5 ans)
 *  - Passionné : Titan III (1 an) → Primordial III (5 ans)
 *  - Extrême   : Titan IV (1 an) → Primordial IV (5 ans, Grade V encore
 *    hors de portée — aucun profil ne plafonne avant 5 ans).
 */
export const XP_THRESHOLDS: readonly number[] = [
  0,
  200,
  550,
  900,
  1350, // Mortel
  1800,
  2600,
  3700,
  5000,
  6450, // Guerrier
  8000,
  9700,
  12250,
  15200,
  18500, // Héros
  22000,
  25450,
  30500,
  36400,
  43000, // Titan
  50000,
  55550,
  63700,
  73200,
  83700, // Olympien
  95000,
  116600,
  148200,
  185100,
  226000, // Primordial
];

if (XP_THRESHOLDS.length !== TOTAL_TIERS) {
  throw new Error(
    `XP_THRESHOLDS doit contenir exactement ${TOTAL_TIERS} paliers (trouvé ${XP_THRESHOLDS.length}).`,
  );
}
