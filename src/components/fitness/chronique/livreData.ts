// ============================================================
// LOT C3 — Données/projections d'affichage du Livre (sans JSX).
//
// Séparé de livreParts.tsx pour respecter react-refresh (un fichier de
// composants n'exporte que des composants). Purement présentationnel :
// rareté des Légendes + projection des spécialisations sur l'échelle RPG
// existante (RANK_TIERS + toRankState, comme le Profil). Aucun calcul
// métier — uniquement de l'habillage de données déjà dérivées.
// ============================================================

import type { RankState } from "@/lib/fitness/exerciseRanks";
import { toRankState } from "@/hooks/useExerciseProgression";
import { projectVolumeToRankTier, type LegendLevel } from "@/lib/fitness/chronicles";

// ── Rareté des Légendes (dérivée du niveau déjà calculé) ──────────────────────

export type Rarity = {
  label: string;
  border: string;
  ring: string;
  glow: string;
  chip: string;
  gradient: string;
};

export const RARITY: Record<LegendLevel, Rarity> = {
  Légendaire: {
    label: "Légendaire",
    border: "border-amber-400/40",
    ring: "ring-amber-400/30",
    glow: "0 0 34px -10px rgba(234,179,8,0.55)",
    chip: "bg-amber-400/15 text-amber-300 border border-amber-400/40",
    gradient: "linear-gradient(90deg,#b45309,#f59e0b,#fde68a)",
  },
  Maîtrisé: {
    label: "Épique",
    border: "border-violet-400/35",
    ring: "ring-violet-400/25",
    glow: "0 0 30px -12px rgba(167,139,250,0.5)",
    chip: "bg-violet-400/15 text-violet-300 border border-violet-400/35",
    gradient: "linear-gradient(90deg,#6d28d9,#a78bfa,#ddd6fe)",
  },
  Confirmé: {
    label: "Rare",
    border: "border-cyan-400/30",
    ring: "ring-cyan-400/20",
    glow: "0 0 26px -12px rgba(34,211,238,0.45)",
    chip: "bg-cyan-400/10 text-cyan-300 border border-cyan-400/30",
    gradient: "linear-gradient(90deg,#0e7490,#22d3ee,#a5f3fc)",
  },
  "En apprentissage": {
    label: "Commun",
    border: "border-white/10",
    ring: "ring-white/10",
    glow: "none",
    chip: "bg-white/[0.06] text-white/60 border border-white/10",
    gradient: "linear-gradient(90deg,#3f3f46,#a1a1aa)",
  },
};

/** Progression de maîtrise vers le niveau supérieur, dérivée des seuils de
 *  `legendLevel` (séances) — purement visuel, aucun nouveau calcul métier. */
export function legendMasteryPercent(level: LegendLevel, sessions: number): number {
  const bounds: Record<LegendLevel, [number, number]> = {
    "En apprentissage": [0, 3],
    Confirmé: [3, 5],
    Maîtrisé: [5, 8],
    Légendaire: [8, 8],
  };
  const [lo, hi] = bounds[level];
  if (level === "Légendaire" || hi <= lo) return 100;
  return Math.max(6, Math.min(100, Math.round(((sessions - lo) / (hi - lo)) * 100)));
}

// ── Rang RPG d'une spécialisation (même échelle que le Profil) ────────────────

export type SpecRank = {
  rank: RankState;
  nextName: string | null;
  gradient: string;
  glow: string;
  text: string;
};

/** Projette le volume d'une spécialisation sur l'échelle RPG existante et
 *  renvoie le RankState d'affichage (via `toRankState`, comme le Profil). */
export function specRankFromVolume(volumeKg: number): SpecRank {
  const { tierIndex, masteryPercent } = projectVolumeToRankTier(volumeKg);
  const rank = toRankState(tierIndex, masteryPercent);
  const next = tierIndex >= 29 ? null : toRankState(tierIndex + 1, 0).fullName;
  return {
    rank,
    nextName: next,
    gradient: rank.rank.colors.gradient,
    glow: rank.rank.colors.glow,
    text: rank.rank.colors.text,
  };
}
