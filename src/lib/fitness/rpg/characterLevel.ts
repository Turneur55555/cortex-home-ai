// ============================================================
// Niveau de Personnage — courbe d'affichage (domaine pur, zéro React).
//
// MIROIR EXACT de la courbe serveur `compute_level_from_xp` :
//     level = FLOOR(SQRT(xp / 50)) + 1
// Formule canonique restaurée par la migration `20260718120000` (l'historique
// avait fait diverger la fonction serveur vers /100 sans +1 — voir cette
// migration pour l'audit complet). Un trigger serveur
// (`trg_enforce_level_from_xp`) garantit désormais que `user_stats.level`
// est TOUJOURS dérivé de `user_stats.xp` par cette même formule, quel que
// soit l'écrivain. Le serveur reste la seule autorité qui ÉCRIT
// `user_stats.level` ; ce module ne fait que DÉRIVER la même valeur et la
// progression intra-niveau pour l'affichage (barre XP de l'Accueil).
//
// ⚠️ `lib/fitness/badges.ts:xpForLevel` utilise une AUTRE formule
// (level²·100) mais n'est appelé nulle part — ce module est la source
// unique d'affichage du Niveau de Personnage. Garder les deux formules
// alignées si `xpForLevel` venait à être réutilisé.
// ============================================================

/** Diviseur de la courbe serveur (sqrt(xp / DIVISOR) + 1). */
export const XP_LEVEL_DIVISOR = 50;

/**
 * Barème d'XP (miroir informatif du barème serveur, source de vérité dans
 * la migration `20260717120000_rpg_character_xp_backbone.sql`). Exposé ici
 * pour l'affichage/les tests ; l'attribution réelle est 100 % serveur.
 */
export const CHARACTER_XP = {
  muscuWorkout: 100,
  supportWorkout: 25,
  supportWeeklyCap: 75,
  muscuPR: 50,
  streak: 15,
} as const;

/** Niveau atteint pour une XP donnée — identique au calcul serveur. */
export function characterLevelForXp(xp: number): number {
  const safe = Math.max(0, xp);
  return Math.floor(Math.sqrt(safe / XP_LEVEL_DIVISOR)) + 1;
}

/** XP cumulée nécessaire pour ENTRER dans un niveau (début du palier). */
export function xpAtLevelStart(level: number): number {
  const l = Math.max(1, level);
  return XP_LEVEL_DIVISOR * (l - 1) ** 2;
}

/** XP cumulée nécessaire pour atteindre le niveau SUIVANT. */
export function xpAtNextLevel(level: number): number {
  const l = Math.max(1, level);
  return XP_LEVEL_DIVISOR * l ** 2;
}

export interface CharacterLevelProgress {
  level: number;
  xp: number;
  /** XP au début du niveau courant. */
  levelStartXp: number;
  /** XP au début du niveau suivant. */
  nextLevelXp: number;
  /** XP acquise dans le niveau courant. */
  xpIntoLevel: number;
  /** Largeur (en XP) du niveau courant. */
  xpForLevelSpan: number;
  /** XP restante avant le niveau suivant. */
  xpToNext: number;
  /** Progression dans le niveau courant, 0..1. */
  progress: number;
}

/**
 * Progression complète d'affichage pour une XP donnée. Le niveau est
 * recalculé depuis l'XP (miroir serveur) — on n'exige pas de le passer, ce
 * qui garantit la cohérence même si `user_stats.level` était momentanément
 * en retard sur `user_stats.xp`.
 */
export function characterLevelProgress(xp: number): CharacterLevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = characterLevelForXp(safeXp);
  const levelStartXp = xpAtLevelStart(level);
  const nextLevelXp = xpAtNextLevel(level);
  const xpForLevelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = Math.max(0, safeXp - levelStartXp);
  const xpToNext = Math.max(0, nextLevelXp - safeXp);
  const progress = Math.min(1, xpIntoLevel / xpForLevelSpan);
  return {
    level,
    xp: safeXp,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpForLevelSpan,
    xpToNext,
    progress,
  };
}
