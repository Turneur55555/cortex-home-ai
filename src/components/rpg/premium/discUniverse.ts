// ============================================================
// Univers du DISQUE — le symbole officiel de CORTEX.
//
// Le Disque est UNE relique unique qui accompagne le joueur toute sa
// progression : jamais un autre objet, jamais un blason, jamais une haltère.
// Sa SILHOUETTE ne change JAMAIS (jante → gorge → champ → cœur, nom gravé en
// arc). Ce module ne décrit QUE ce qui ÉVOLUE entre les 6 rangs : diamètre,
// épaisseur, profondeur des gravures, rayons, énergie, effet de surface.
//
// Les COULEURS/MATIÈRES restent la source unique de `rankVisuals.ts`
// (metal, enamel, particleColor) et `exerciseRanks.ts` (colors) — on ne les
// duplique pas ici. Purement des constantes, zéro dépendance React.
// ============================================================

import type { RankKey } from "@/lib/fitness/exerciseRanks";

/** Effet de surface propre à la matière du rang. */
export type DiscSurface =
  | "raw" // Mortel — fonte brute, cœur éteint
  | "forge" // Guerrier — acier forgé, étincelles
  | "rune" // Héros — métal noble, runes qui s'allument
  | "molten" // Titan — métal volcanique, lave dans les fissures
  | "divine" // Olympien — or parfait, rayons divins, flotte
  | "cosmic"; // Primordial — métal inconnu, cristaux, constellations

export interface DiscTier {
  /** Diamètre relatif — le disque GRANDIT avec le rang (0.84 → 1.0). */
  scale: number;
  /** Épaisseur de la jante (fraction du rayon extérieur). */
  rim: number;
  /** Profondeur des gravures gorge/rayons (opacité des creux, 0..1). */
  groove: number;
  /** Nombre de rayons gravés (spokes) — la texture se densifie. */
  spokes: number;
  /** Nombre d'encoches runiques sur l'anneau intérieur. */
  runes: number;
  /** Intensité d'énergie 0..1 — pilote halo, flottement, cœur, effets. */
  energy: number;
  /** Effet de surface / matière du rang. */
  surface: DiscSurface;
}

/**
 * Progression de la relique. Plus le rang est élevé, plus le disque paraît
 * grand, lourd, gravé et vivant. Le cœur s'allume, la jante s'épaissit, les
 * gravures se creusent — la même relique, chargée de plus en plus de puissance.
 */
export const DISC_TIERS: Record<RankKey, DiscTier> = {
  mortel: {
    scale: 0.84,
    rim: 0.14,
    groove: 0.32,
    spokes: 8,
    runes: 0,
    energy: 0.12,
    surface: "raw",
  },
  guerrier: {
    scale: 0.89,
    rim: 0.16,
    groove: 0.48,
    spokes: 12,
    runes: 6,
    energy: 0.32,
    surface: "forge",
  },
  heros: {
    scale: 0.92,
    rim: 0.17,
    groove: 0.6,
    spokes: 12,
    runes: 10,
    energy: 0.52,
    surface: "rune",
  },
  titan: {
    scale: 0.95,
    rim: 0.2,
    groove: 0.72,
    spokes: 16,
    runes: 12,
    energy: 0.74,
    surface: "molten",
  },
  olympien: {
    scale: 0.98,
    rim: 0.19,
    groove: 0.64,
    spokes: 18,
    runes: 14,
    energy: 0.9,
    surface: "divine",
  },
  primordial: {
    scale: 1.0,
    rim: 0.22,
    groove: 0.82,
    spokes: 20,
    runes: 16,
    energy: 1,
    surface: "cosmic",
  },
};

export function discTierFor(key: RankKey): DiscTier {
  return DISC_TIERS[key];
}
