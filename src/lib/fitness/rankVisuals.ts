// ============================================================
// Direction artistique "Reliquary" — extensions visuelles par rang.
// Purement statique, aucun import React. Ne touche ni aux calculs
// ni aux tokens de couleur définis dans exerciseRanks.ts.
// ============================================================

import type { RankKey } from "./exerciseRanks";

export type SigilKind =
  | "rune"      // Mortel — rune de pierre
  | "swords"    // Guerrier — épées croisées
  | "laurel"   // Héros — couronne de laurier
  | "flame"     // Titan — flamme volumétrique
  | "thunder"   // Olympien — foudre + soleil
  | "galaxy";   // Primordial — spirale galactique

export interface RankVisual {
  key: RankKey;
  sigil: SigilKind;
  /** Fond d'atmosphère de la carte (CSS background complet, multi-couches). */
  atmosphere: string;
  /** Couleur de vignettage / bord de la carte. */
  vignette: string;
  /** Couleur des particules ambiantes. */
  particleColor: string;
  /** Nombre de particules ambiantes (0-8). */
  particleCount: number;
  /** Métal de la plaque extérieure du badge (gradient CSS). */
  metal: string;
  /** Émail intérieur du badge (gradient radial CSS). */
  enamel: string;
  /** Étiquette poétique — jamais affichée seule, utilisée en hint. */
  ambiance: string;
}

export const RANK_VISUALS: Record<RankKey, RankVisual> = {
  mortel: {
    key: "mortel",
    sigil: "rune",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(168,162,158,0.10) 0%, transparent 55%),
      radial-gradient(80% 60% at 20% 100%, rgba(87,83,78,0.18) 0%, transparent 60%),
      linear-gradient(180deg,#0e0d0c 0%,#050505 100%)`,
    vignette: "rgba(120,113,108,0.35)",
    particleColor: "rgba(214,211,209,0.35)",
    particleCount: 3,
    metal: "linear-gradient(140deg,#3f3b38 0%,#78716c 45%,#2a2725 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#a8a29e 0%,#57534e 55%,#1c1917 100%)",
    ambiance: "Pierre silencieuse",
  },
  guerrier: {
    key: "guerrier",
    sigil: "swords",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(205,127,50,0.18) 0%, transparent 55%),
      radial-gradient(80% 70% at 100% 100%, rgba(180,83,9,0.20) 0%, transparent 60%),
      linear-gradient(180deg,#1a0f06 0%,#080503 100%)`,
    vignette: "rgba(205,127,50,0.40)",
    particleColor: "rgba(251,191,36,0.55)",
    particleCount: 5,
    metal: "linear-gradient(140deg,#78350f 0%,#cd7f32 40%,#78350f 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#fbbf24 0%,#b45309 60%,#3f2110 100%)",
    ambiance: "Forge & acier",
  },
  heros: {
    key: "heros",
    sigil: "laurel",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(226,232,240,0.16) 0%, transparent 55%),
      radial-gradient(80% 70% at 10% 100%, rgba(148,163,184,0.20) 0%, transparent 60%),
      linear-gradient(180deg,#0f1215 0%,#050607 100%)`,
    vignette: "rgba(226,232,240,0.45)",
    particleColor: "rgba(241,245,249,0.55)",
    particleCount: 6,
    metal: "linear-gradient(140deg,#475569 0%,#e2e8f0 45%,#64748b 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#f8fafc 0%,#94a3b8 60%,#1e293b 100%)",
    ambiance: "Bronze & marbre",
  },
  titan: {
    key: "titan",
    sigil: "flame",
    atmosphere: `radial-gradient(120% 80% at 50% 0%, rgba(239,68,68,0.22) 0%, transparent 55%),
      radial-gradient(80% 70% at 100% 100%, rgba(185,28,28,0.28) 0%, transparent 60%),
      radial-gradient(40% 30% at 50% 60%, rgba(248,113,113,0.10) 0%, transparent 70%),
      linear-gradient(180deg,#1a0606 0%,#080202 100%)`,
    vignette: "rgba(239,68,68,0.55)",
    particleColor: "rgba(252,165,165,0.70)",
    particleCount: 7,
    metal: "linear-gradient(140deg,#7f1d1d 0%,#ef4444 45%,#450a0a 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#fecaca 0%,#dc2626 55%,#450a0a 100%)",
    ambiance: "Lave & braises",
  },
  olympien: {
    key: "olympien",
    sigil: "thunder",
    atmosphere: `radial-gradient(120% 90% at 50% 0%, rgba(234,179,8,0.24) 0%, transparent 55%),
      radial-gradient(80% 70% at 20% 100%, rgba(37,99,235,0.30) 0%, transparent 60%),
      radial-gradient(60% 40% at 80% 20%, rgba(254,249,195,0.10) 0%, transparent 70%),
      linear-gradient(180deg,#050a1a 0%,#02040a 100%)`,
    vignette: "rgba(234,179,8,0.60)",
    particleColor: "rgba(254,240,138,0.85)",
    particleCount: 8,
    metal: "linear-gradient(140deg,#1e3a8a 0%,#eab308 50%,#1e3a8a 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#fef3c7 0%,#eab308 45%,#1e3a8a 100%)",
    ambiance: "Ciel & foudre",
  },
  primordial: {
    key: "primordial",
    sigil: "galaxy",
    atmosphere: `radial-gradient(120% 90% at 50% 0%, rgba(167,139,250,0.28) 0%, transparent 55%),
      radial-gradient(80% 70% at 10% 100%, rgba(76,29,149,0.35) 0%, transparent 60%),
      radial-gradient(50% 40% at 70% 30%, rgba(248,250,252,0.10) 0%, transparent 70%),
      linear-gradient(180deg,#0a0518 0%,#020108 100%)`,
    vignette: "rgba(167,139,250,0.70)",
    particleColor: "rgba(233,213,255,0.90)",
    particleCount: 8,
    metal: "linear-gradient(140deg,#1e1b4b 0%,#a78bfa 45%,#4c1d95 100%)",
    enamel: "radial-gradient(circle at 35% 30%,#f5f3ff 0%,#8b5cf6 45%,#1e1b4b 100%)",
    ambiance: "Cosmos & nébuleuse",
  },
};

export function getRankVisual(key: RankKey): RankVisual {
  return RANK_VISUALS[key];
}
