// ============================================================
// Direction artistique "Reliquary" appliquée à la rareté des badges de
// compte (et non plus au rang par exercice). Même structure que
// `rankVisuals.ts`, purement statique, zéro import React — décision produit
// du 06/07/2026 : Badges & Succès reprend l'identité graphique RPG créée
// pour les exercices.
// ============================================================

import type { BadgeRarity } from "./badges";

export interface RarityVisual {
  key: BadgeRarity;
  /** Fond d'atmosphère de la carte mise en avant (CSS background complet). */
  atmosphere: string;
  /** Couleur de vignettage / bord. */
  vignette: string;
  /** Couleur des particules ambiantes (réservées aux badges mis en avant). */
  particleColor: string;
  /** Nombre de particules ambiantes (0 = aucune, rareté commune n'en a pas besoin). */
  particleCount: number;
  /** Métal de la plaque extérieure du médaillon (gradient CSS). */
  metal: string;
  /** Émail intérieur du médaillon (gradient radial CSS). */
  enamel: string;
}

export const RARITY_VISUALS: Record<BadgeRarity, RarityVisual> = {
  common: {
    key: "common",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(74,222,128,0.12) 0%, transparent 55%),
      linear-gradient(180deg,#0b120e 0%,#050705 100%)`,
    vignette: "rgba(74,222,128,0.30)",
    particleColor: "rgba(134,239,172,0.35)",
    particleCount: 0,
    metal: "linear-gradient(140deg,#14532d 0%,#4ade80 45%,#052e16 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#86efac 0%,#16a34a 55%,#052e16 100%)",
  },
  rare: {
    key: "rare",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(96,165,250,0.16) 0%, transparent 55%),
      radial-gradient(80% 60% at 20% 100%, rgba(37,99,235,0.18) 0%, transparent 60%),
      linear-gradient(180deg,#050b17 0%,#03060d 100%)`,
    vignette: "rgba(96,165,250,0.40)",
    particleColor: "rgba(147,197,253,0.55)",
    particleCount: 4,
    metal: "linear-gradient(140deg,#1e3a8a 0%,#60a5fa 45%,#0c1c3f 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#bfdbfe 0%,#3b82f6 55%,#0c1c3f 100%)",
  },
  epic: {
    key: "epic",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(167,139,250,0.20) 0%, transparent 55%),
      radial-gradient(80% 70% at 100% 100%, rgba(124,58,237,0.22) 0%, transparent 60%),
      linear-gradient(180deg,#0d0818 0%,#05030c 100%)`,
    vignette: "rgba(167,139,250,0.50)",
    particleColor: "rgba(216,180,254,0.65)",
    particleCount: 5,
    metal: "linear-gradient(140deg,#4c1d95 0%,#a78bfa 45%,#2e1065 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#e9d5ff 0%,#8b5cf6 55%,#2e1065 100%)",
  },
  legendary: {
    key: "legendary",
    atmosphere: `radial-gradient(120% 90% at 50% 0%, rgba(251,191,36,0.24) 0%, transparent 55%),
      radial-gradient(80% 70% at 20% 100%, rgba(217,119,6,0.24) 0%, transparent 60%),
      radial-gradient(60% 40% at 80% 20%, rgba(254,249,195,0.10) 0%, transparent 70%),
      linear-gradient(180deg,#170f02 0%,#080501 100%)`,
    vignette: "rgba(251,191,36,0.60)",
    particleColor: "rgba(254,240,138,0.85)",
    particleCount: 7,
    metal: "linear-gradient(140deg,#78350f 0%,#fbbf24 45%,#451a03 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#fef3c7 0%,#f59e0b 55%,#451a03 100%)",
  },
  mythic: {
    key: "mythic",
    atmosphere: `radial-gradient(120% 90% at 50% 0%, rgba(239,68,68,0.26) 0%, transparent 55%),
      radial-gradient(80% 70% at 100% 100%, rgba(185,28,28,0.30) 0%, transparent 60%),
      radial-gradient(40% 30% at 50% 60%, rgba(248,113,113,0.12) 0%, transparent 70%),
      linear-gradient(180deg,#1a0606 0%,#080202 100%)`,
    vignette: "rgba(239,68,68,0.65)",
    particleColor: "rgba(252,165,165,0.85)",
    particleCount: 8,
    metal: "linear-gradient(140deg,#7f1d1d 0%,#ef4444 45%,#450a0a 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#fecaca 0%,#dc2626 55%,#450a0a 100%)",
  },
};

export function getRarityVisual(key: BadgeRarity): RarityVisual {
  return RARITY_VISUALS[key];
}
