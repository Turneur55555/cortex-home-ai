// ============================================================
// Titre + Grade — source de vérité de la progression RPG affichée.
//
// Domaine pur, zéro React. Dérive le Titre et le Grade visibles par le
// joueur à partir du Level interne (lui-même calculé depuis l'XP par
// `characterLevel.ts`). Le Level reste une donnée technique interne et
// n'est JAMAIS exposé ici pour l'affichage.
//
//   XP → Level (interne) → Titre → Grade
//
// Le Titre est calculé uniquement à partir du Level. Le Grade est calculé
// uniquement à partir de la progression dans la bande du Titre. Aucun
// composant React ne doit recalculer ces valeurs ni coder du texte RPG en
// dur : tout passe par ce module.
//
// Réutilise `LEVELS_PER_RANK` de `exerciseRanks.ts` (les 6 titres
// mythologiques officiels y sont déjà définis) pour borner les bandes. La
// courbe XP et les calculs métier de `characterLevel.ts` ne sont PAS
// modifiés : ce module ne fait que DÉRIVER une présentation au-dessus.
// ============================================================

import { characterLevelForXp, characterLevelProgress } from "./characterLevel";
import { LEVELS_PER_RANK, RANK_TIERS } from "../exerciseRanks";

/**
 * Grades officiels du titre Mortel (ordre définitif). Les grades des autres
 * titres seront définis dans une PR dédiée : on n'affiche alors qu'un
 * libellé neutre temporaire (numéroté) pour ne pas inventer de vocabulaire.
 */
export const MORTAL_GRADES = ["Éveillé", "Initié", "Aguerri", "Accompli", "Émérite"] as const;

/** Nombre de grades par titre (aligné sur `LEVELS_PER_RANK`). */
export const GRADES_PER_TITLE = LEVELS_PER_RANK;

/** Titre officiel pour un Level interne donné. */
export function characterTitleForLevel(level: number): string {
  const l = Math.max(1, Math.floor(level));
  const titleIndex = Math.min(RANK_TIERS.length - 1, Math.floor((l - 1) / LEVELS_PER_RANK));
  return RANK_TIERS[titleIndex].label;
}

/** Index du grade dans la bande du titre courant, 0..GRADES_PER_TITLE-1. */
export function characterGradeIndexForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.min(GRADES_PER_TITLE - 1, (l - 1) % LEVELS_PER_RANK);
}

/** Libellé du grade officiel pour le titre Mortel ; libellé neutre sinon. */
export function characterGradeLabelForLevel(level: number): string {
  const idx = characterGradeIndexForLevel(level);
  const title = characterTitleForLevel(level);
  if (title === RANK_TIERS[0].label) return MORTAL_GRADES[idx];
  return `${idx + 1}${ordinalSuffixFr(idx + 1)} grade`;
}

/** Vrai quand le titre courant possède des grades officiels (Mortel seul). */
export function hasOfficialGrades(level: number): boolean {
  return characterTitleForLevel(level) === RANK_TIERS[0].label;
}

/** Libellé du grade suivant dans la bande du titre courant, ou null si max. */
export function nextGradeLabelForLevel(level: number): string | null {
  const idx = characterGradeIndexForLevel(level);
  if (idx >= GRADES_PER_TITLE - 1) return null;
  const nextLevel = Math.floor(level) + 1;
  return characterGradeLabelForLevel(nextLevel);
}

/** État d'affichage agrégé de la progression RPG — consommé par les UI. */
export interface CharacterProgression {
  /** XP cumulée actuelle. */
  xp: number;
  /** Titre officiel (ex. "Titan"). */
  title: string;
  /** Libellé du grade courant (ex. "Accompli"). */
  grade: string;
  /** XP restante avant le grade suivant (0 si grade maximal du titre). */
  xpToNextGrade: number;
  /** Libellé du grade suivant, ou null si grade maximal du titre atteint. */
  nextGrade: string | null;
  /** Vrai si le grade courant est le dernier de la bande du titre. */
  isMaxGradeInTitle: boolean;
}

/**
 * Progression RPG affichable pour une XP donnée. Dérive le Titre et le Grade
 * depuis le Level interne (recalculé depuis l'XP via `characterLevel.ts`) et
 * l'XP restante avant le prochain grade. Aucune donnée de Level n'est
 * renvoyée : le consommateur ne peut pas la fuiter vers l'UI.
 */
export function characterProgression(xp: number): CharacterProgression {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = characterLevelForXp(safeXp);
  const progress = characterLevelProgress(safeXp);
  const nextGrade = nextGradeLabelForLevel(level);
  const isMaxGradeInTitle = nextGrade === null;
  return {
    xp: safeXp,
    title: characterTitleForLevel(level),
    grade: characterGradeLabelForLevel(level),
    xpToNextGrade: isMaxGradeInTitle ? 0 : progress.xpToNext,
    nextGrade,
    isMaxGradeInTitle,
  };
}

function ordinalSuffixFr(n: number): string {
  if (n === 1) return "er";
  return "e";
}
