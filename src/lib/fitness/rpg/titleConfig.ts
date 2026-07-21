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
 *  - Primordial représente plusieurs années d'investissement.
 * Valeurs figées, éditables individuellement — aucune formule.
 */
export const XP_THRESHOLDS: readonly number[] = [
  0,
  380,
  1300,
  2650,
  4400, // Mortel
  6500,
  8950,
  11750,
  14900,
  18300, // Guerrier
  22000,
  26000,
  30350,
  35000,
  39900, // Héros
  45000,
  50400,
  56100,
  62000,
  68200, // Titan
  74600,
  81250,
  88200,
  95500,
  103000, // Olympien
  110700,
  118500,
  126600,
  135000,
  143500, // Primordial
];

if (XP_THRESHOLDS.length !== TOTAL_TIERS) {
  throw new Error(
    `XP_THRESHOLDS doit contenir exactement ${TOTAL_TIERS} paliers (trouvé ${XP_THRESHOLDS.length}).`,
  );
}
