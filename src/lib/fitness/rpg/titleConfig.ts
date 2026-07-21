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
 * (Mortel — Éveillé) = 0 XP. Croissance pensée pour que :
 *  - les premiers grades de Mortel tombent vite (quelques séances) ;
 *  - Guerrier arrive après plusieurs dizaines de séances ;
 *  - Héros après plusieurs mois d'entraînement régulier ;
 *  - Titan soit réservé aux joueurs très investis ;
 *  - Olympien après plusieurs centaines de séances ;
 *  - Primordial représente plusieurs années d'investissement, sans jamais
 *    être épuisé (Grade V) par un joueur même extrême en moins de 5 ans.
 * Valeurs figées, éditables individuellement — aucune formule.
 *
 * Recalibrées en P1.7 après réduction de l'économie XP à 5 familles
 * (workout_muscu / workout_support / streak / exercise_progress_record /
 * exercise_rank_up — retrait de pr_muscu, badges, achievements, goals de
 * l'économie XP). Simulation sur 4 profils (Débutant 2 séances/sem →
 * Extrême quasi quotidien) de 1 semaine à 5 ans : aucun profil ne plafonne
 * avant 5 ans, y compris Extrême (Primordial IV à 5 ans, Grade V encore
 * hors de portée).
 */
export const XP_THRESHOLDS: readonly number[] = [
  0,
  380,
  1300,
  2650,
  4400, // Mortel
  6500,
  8400,
  11200,
  14500,
  18100, // Guerrier
  22000,
  24450,
  28100,
  32300,
  36950, // Héros
  42000,
  44950,
  49300,
  54350,
  59950, // Titan
  66000,
  70800,
  77850,
  86100,
  95200, // Olympien
  105000,
  122900,
  149050,
  179650,
  213500, // Primordial
];

if (XP_THRESHOLDS.length !== TOTAL_TIERS) {
  throw new Error(
    `XP_THRESHOLDS doit contenir exactement ${TOTAL_TIERS} paliers (trouvé ${XP_THRESHOLDS.length}).`,
  );
}
