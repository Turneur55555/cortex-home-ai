// ============================================================
// Signature visuelle CORTEX — tokens de design premium partagés.
//
// UNE seule source pour le langage graphique du RPG : courbes d'animation,
// durées, respiration, halos. Réutilisé par tous les écrans premium (Hero,
// montées de rang, récompenses, Saisons, Chroniques, Reliques) qui affichent
// un rang via `RankIllustration` (src/components/rpg/RankIllustration.tsx +
// src/assets/ranks) — pour que chaque écran appartienne au même univers.
//
// Purement des constantes, zéro dépendance. Aucune couleur de rang ici : les
// couleurs viennent de `exerciseRanks.ts` (par rang).
// ============================================================

/** Entrée « premium » — décélération franche puis pose douce. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Va-et-vient équilibré (respiration, halos). */
export const EASE_IN_OUT = [0.45, 0, 0.2, 1] as const;
/** Remplissage de barre / révélation d'emblème. */
export const EASE_EMBLEM = [0.22, 1, 0.36, 1] as const;

/** Durées de référence (secondes). */
export const DUR = {
  fast: 0.35,
  base: 0.55,
  slow: 0.9,
  cinematic: 1.4,
} as const;

// NB : pas de `as const` sur les objets d'animation — framer-motion attend des
// tableaux de keyframes MUTABLES dans `animate` (un tuple readonly est rejeté).
/** Flottement vertical partagé d'un objet « précieux » (blason, relique). */
export const FLOAT = {
  animate: { y: [0, -5, 0] },
  transition: { duration: 5, repeat: Infinity, ease: EASE_IN_OUT },
};

/** Respiration d'un halo (opacité + échelle). */
export const HALO_BREATH = {
  animate: { opacity: [0.5, 0.85, 0.5], scale: [0.92, 1.06, 0.92] },
  transition: { duration: 3.4, repeat: Infinity, ease: EASE_IN_OUT },
};

/**
 * Révélation en cascade : delay d'un élément d'index i (secondes). Donne le
 * rythme « les choses arrivent une à une », signature des écrans premium.
 */
export function stagger(i: number, base = 0.08, start = 0.05): number {
  return start + i * base;
}

/** Pile de police serif — utilisée pour les noms de RANG (prestige). */
export const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

/** Ombre portée « pièce précieuse » paramétrée par la lueur du rang. */
export function emblemShadow(glow: string): string {
  return `0 18px 60px -22px ${glow}, 0 4px 18px -8px rgba(0,0,0,0.6)`;
}
