// ============================================================
// Nommage des Grades (P2) — purement présentiel.
//
// Chaque famille de Rang (Mortel, Guerrier, Héros, Titan, Olympien,
// Primordial) contient LEVELS_PER_RANK positions ; l'ancien affichage
// utilisait des chiffres romains (I..V). P2 remplace ce libellé par un
// GRADE nommé, plus lisible pour le joueur ("Accompli" plutôt que "III").
//
// Aucune logique métier : le calcul du rang/tier reste dans le moteur Rang
// (`lib/fitness/rank/engine.ts`) et dans `toRankState`. Ce module ne fait
// que traduire `levelInRank` (1..5) en libellé pour l'UI.
// ============================================================

import { RANK_TIERS, LEVELS_PER_RANK, type RankState } from "@/lib/fitness/exerciseRanks";

/** Grades nommés à l'intérieur d'une famille (positions 1..5). */
export const GRADE_NAMES = ["Novice", "Aspirant", "Accompli", "Émérite", "Maître"] as const;

/** Libellé du grade pour une position 1..LEVELS_PER_RANK. */
export function gradeName(levelInRank: number): string {
  const idx = Math.max(1, Math.min(LEVELS_PER_RANK, levelInRank)) - 1;
  return GRADE_NAMES[idx];
}

/**
 * Libellé du grade suivant : soit le grade suivant dans la même famille,
 * soit le premier grade de la famille suivante ("Novice Guerrier"), soit
 * `null` si c'est déjà le grade suprême.
 */
export function nextGradeLabel(rank: RankState): string | null {
  if (rank.isMax) return null;
  if (rank.levelInRank < LEVELS_PER_RANK) {
    return gradeName(rank.levelInRank + 1);
  }
  const familyIdx = RANK_TIERS.findIndex((r) => r.key === rank.rank.key);
  const nextFamily = RANK_TIERS[familyIdx + 1];
  if (!nextFamily) return null;
  return `${GRADE_NAMES[0]} ${nextFamily.label}`;
}

/** Formatage FR d'une XP entière avec espace fine insécable comme séparateur. */
export function formatXp(xp: number): string {
  return Math.max(0, Math.round(xp)).toLocaleString("fr-FR").replace(/\s/g, "\u202f");
}
