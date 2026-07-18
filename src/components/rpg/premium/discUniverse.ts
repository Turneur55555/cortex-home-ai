// ============================================================
// Univers du DISQUE — le symbole officiel de CORTEX.
//
// Le Disque est UNE relique unique qui accompagne le joueur toute sa
// progression : jamais un autre objet, jamais un blason, jamais une haltère.
// Sa SILHOUETTE ne change JAMAIS (jante → gorge → champ → cœur, nom gravé en
// arc). Ce module ne décrit QUE ce qui ÉVOLUE entre les 6 rangs : diamètre,
// épaisseur, profondeur des gravures, texture de forge, usure, énergie.
//
// Les COULEURS/MATIÈRES restent la source unique de `rankVisuals.ts`
// (metal, enamel, particleColor) et `exerciseRanks.ts` (colors) — on ne les
// duplique pas ici. Purement des constantes, zéro dépendance React.
// ============================================================

import type { RankKey } from "@/lib/fitness/exerciseRanks";

/** Effet de surface propre à la matière du rang. */
export type DiscSurface =
  | "raw" // Mortel — acier brut, froid, simple
  | "forge" // Guerrier — forge, premières marques de combat
  | "rune" // Héros — relique ancienne, gravures nobles
  | "molten" // Titan — métal volcanique, fissures de lave
  | "divine" // Olympien — métal parfait, lumière divine
  | "cosmic"; // Primordial — matière cosmique, énergie ancestrale

export interface DiscTier {
  /** Diamètre relatif — le disque GRANDIT avec le rang (0.86 → 1.0). */
  scale: number;
  /** Épaisseur de la jante massive (fraction du rayon extérieur). */
  rim: number;
  /** Profondeur des gravures gorge/rayons (0..1). */
  groove: number;
  /** Nombre de facettes radiales forgées. */
  spokes: number;
  /** Nombre d'encoches / rivets sur l'anneau intérieur. */
  runes: number;
  /** Intensité d'énergie 0..1 — pilote halo, flottement, cœur, effets. */
  energy: number;
  /** Rugosité de la texture de forge (0..1) — Titan rêche, Olympien lisse. */
  rough: number;
  /** Profondeur du relief de forge / martelage (0..1). */
  relief: number;
  /** Usure : micro-rayures, éclats, imperfections (0..1). */
  wear: number;
  /** Effet de surface / matière du rang. */
  surface: DiscSurface;
}

/**
 * Progression de la relique. Plus le rang est élevé, plus le disque paraît
 * grand, lourd, gravé et vivant. Chaque rang raconte une histoire : acier brut
 * (Mortel) → forge marquée (Guerrier) → relique noble (Héros) → métal
 * volcanique (Titan) → métal parfait divin (Olympien) → artefact cosmique
 * millénaire (Primordial). La même relique, chargée de plus en plus de
 * puissance.
 */
export const DISC_TIERS: Record<RankKey, DiscTier> = {
  mortel: {
    scale: 0.86,
    rim: 0.16,
    groove: 0.4,
    spokes: 10,
    runes: 0,
    energy: 0.12,
    rough: 0.55,
    relief: 0.55,
    wear: 0.5,
    surface: "raw",
  },
  guerrier: {
    scale: 0.9,
    rim: 0.18,
    groove: 0.55,
    spokes: 12,
    runes: 8,
    energy: 0.32,
    rough: 0.62,
    relief: 0.68,
    wear: 0.78,
    surface: "forge",
  },
  heros: {
    scale: 0.93,
    rim: 0.19,
    groove: 0.66,
    spokes: 12,
    runes: 12,
    energy: 0.52,
    rough: 0.42,
    relief: 0.62,
    wear: 0.55,
    surface: "rune",
  },
  titan: {
    scale: 0.96,
    rim: 0.22,
    groove: 0.78,
    spokes: 16,
    runes: 14,
    energy: 0.74,
    rough: 0.9,
    relief: 0.95,
    wear: 0.85,
    surface: "molten",
  },
  olympien: {
    scale: 0.98,
    rim: 0.2,
    groove: 0.7,
    spokes: 18,
    runes: 16,
    energy: 0.9,
    rough: 0.2,
    relief: 0.42,
    wear: 0.16,
    surface: "divine",
  },
  primordial: {
    scale: 1.0,
    rim: 0.24,
    groove: 0.88,
    spokes: 20,
    runes: 18,
    energy: 1,
    rough: 0.6,
    relief: 0.78,
    wear: 0.5,
    surface: "cosmic",
  },
};

export function discTierFor(key: RankKey): DiscTier {
  return DISC_TIERS[key];
}
