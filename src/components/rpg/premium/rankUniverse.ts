// ============================================================
// Univers de Rang — chaque famille de rang est un MONDE, pas une couleur.
//
// Définit, par rang, le COMPORTEMENT des particules ambiantes (braises,
// étincelles, rayons, poussière, motes, cosmos) qui donnent à chaque rang son
// atmosphère propre. Réutilisé par le Blason et (à venir) les montées de rang,
// récompenses, Chroniques, Reliques — pour que chaque rang soit reconnaissable
// au premier coup d'œil, dans tout CORTEX.
//
// Les COULEURS restent dans `rankVisuals.ts` / `exerciseRanks.ts` ; ce module
// n'ajoute que la "physique" de l'ambiance. Purement des constantes.
// ============================================================

import type { RankKey } from "@/lib/fitness/exerciseRanks";

export type RankParticleKind = "dust" | "sparks" | "motes" | "embers" | "rays" | "cosmos";

export interface ParticleParams {
  /** Densité de base (nombre de particules). */
  count: number;
  /** Sens vertical dominant : > 0 monte (braises), < 0 retombe (poussière). */
  rise: number;
  /** Fourchette de durée d'un cycle (secondes). */
  speed: [number, number];
  /** Amplitude de dérive horizontale (px). */
  drift: number;
  /** Fourchette de taille (px). */
  sizeRange: [number, number];
  /** Scintillement (opacité pulsée) plutôt que trajectoire. */
  twinkle: boolean;
  /** Faisceaux de lumière tournants derrière l'emblème (Olympien). */
  beams?: boolean;
}

/** Physique d'ambiance par nature de particule. */
export const PARTICLE_PARAMS: Record<RankParticleKind, ParticleParams> = {
  // Mortel — poussière de pierre qui retombe lentement.
  dust: { count: 7, rise: -1, speed: [5, 8], drift: 5, sizeRange: [1, 2], twinkle: false },
  // Guerrier — étincelles de forge, vives et brèves.
  sparks: { count: 10, rise: 1.2, speed: [1.6, 3], drift: 10, sizeRange: [1, 2.5], twinkle: false },
  // Héros — motes de lumière douces qui s'élèvent.
  motes: { count: 8, rise: 0.8, speed: [4, 7], drift: 7, sizeRange: [1.5, 3], twinkle: true },
  // Titan — braises ardentes montantes.
  embers: { count: 12, rise: 1, speed: [3, 5.5], drift: 8, sizeRange: [2, 4], twinkle: false },
  // Olympien — poussière d'or + faisceaux divins.
  rays: {
    count: 9,
    rise: 0.6,
    speed: [4, 7],
    drift: 6,
    sizeRange: [1.5, 3],
    twinkle: true,
    beams: true,
  },
  // Primordial — cosmos, étoiles dérivantes qui scintillent.
  cosmos: { count: 12, rise: 0.2, speed: [6, 10], drift: 10, sizeRange: [1, 2.5], twinkle: true },
};

/** Univers (nature de particule) par famille de rang. */
export const RANK_PARTICLE_KIND: Record<RankKey, RankParticleKind> = {
  mortel: "dust",
  guerrier: "sparks",
  heros: "motes",
  titan: "embers",
  olympien: "rays",
  primordial: "cosmos",
};

export function particleParamsFor(key: RankKey): ParticleParams {
  return PARTICLE_PARAMS[RANK_PARTICLE_KIND[key]];
}
