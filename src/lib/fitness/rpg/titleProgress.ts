// ============================================================
// Progression principale — moteur pur, zéro React.
//
// Entrée : UNIQUEMENT l'XP globale (`user_stats.xp`). Sortie : Titre,
// Grade, seuil actuel, seuil suivant, XP restante. Ce moteur ignore
// TOUJOURS l'origine de l'XP (séance, PR, Chronique, défi...) — c'est le
// rôle du Reward Engine (serveur) de décider qui verse combien.
//
// Indépendant de `characterLevel.ts` (aucun import croisé) : ce module ne
// dérive rien de la courbe de "Niveau" historique, qui reste en place en
// interne pour compatibilité technique mais n'est plus la source
// d'affichage du Titre/Grade.
// ============================================================

import { RANK_TIERS, type RankTier } from "@/lib/fitness/exerciseRanks";
import { GRADE_NAMES_BY_TITLE, LEVELS_PER_TITLE, TOTAL_TIERS, XP_THRESHOLDS } from "./titleConfig";

export interface TitleProgress {
  /** Palier global 0..29. */
  tierIndex: number;
  /** Titre (Mortel..Primordial), réutilise le libellé/couleurs du Rang par exercice. */
  title: RankTier;
  /** Index du Titre, 0..5. */
  titleIndex: number;
  /** Grade nommé courant. */
  grade: string;
  /** Index du Grade dans son Titre, 0..4. */
  gradeIndex: number;
  xp: number;
  /** XP au début du palier courant. */
  xpCurrentThreshold: number;
  /** XP au début du palier suivant, `null` si Grade suprême atteint. */
  xpNextThreshold: number | null;
  /** XP restante avant le prochain Grade, 0 si suprême. */
  xpToNext: number;
  isMax: boolean;
}

/** Palier atteint pour une XP donnée, en cherchant le plus haut seuil franchi. */
function tierForXp(xp: number): number {
  let tier = 0;
  for (let i = 0; i < TOTAL_TIERS; i++) {
    if (xp >= XP_THRESHOLDS[i]) {
      tier = i;
    } else {
      break;
    }
  }
  return tier;
}

/** Progression complète d'affichage pour une XP donnée. */
export function titleProgressForXp(xp: number): TitleProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const tierIndex = tierForXp(safeXp);
  const titleIndex = Math.floor(tierIndex / LEVELS_PER_TITLE);
  const gradeIndex = tierIndex % LEVELS_PER_TITLE;
  const title = RANK_TIERS[titleIndex];
  const grade = GRADE_NAMES_BY_TITLE[title.key][gradeIndex];
  const isMax = tierIndex >= TOTAL_TIERS - 1;
  const xpCurrentThreshold = XP_THRESHOLDS[tierIndex];
  const xpNextThreshold = isMax ? null : XP_THRESHOLDS[tierIndex + 1];
  const xpToNext = xpNextThreshold == null ? 0 : Math.max(0, xpNextThreshold - safeXp);

  return {
    tierIndex,
    title,
    titleIndex,
    grade,
    gradeIndex,
    xp: safeXp,
    xpCurrentThreshold,
    xpNextThreshold,
    xpToNext,
    isMax,
  };
}

/** Libellé du prochain Grade ("Vétéran" ou "Célèbre" au changement de Titre), `null` si suprême. */
export function nextGradeLabel(progress: TitleProgress): string | null {
  if (progress.isMax) return null;
  const nextTierIndex = progress.tierIndex + 1;
  const nextTitleIndex = Math.floor(nextTierIndex / LEVELS_PER_TITLE);
  const nextGradeIndex = nextTierIndex % LEVELS_PER_TITLE;
  const nextTitle = RANK_TIERS[nextTitleIndex];
  return GRADE_NAMES_BY_TITLE[nextTitle.key][nextGradeIndex];
}
