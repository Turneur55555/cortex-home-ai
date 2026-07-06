// ============================================================
// Système de rangs RPG par exercice — mythologie grecque
// Configurable, purement fonctionnel, aucun import React.
// ============================================================

import { normalize } from "./exerciseCatalog";

export type RankKey = "mortel" | "guerrier" | "heros" | "titan" | "olympien" | "primordial";

export interface RankTierColors {
  primary: string;      // couleur dominante
  secondary: string;    // accent
  glow: string;         // halo / shadow
  text: string;         // texte foreground du badge
  gradient: string;     // gradient CSS complet pour la barre
}

export interface RankTier {
  key: RankKey;
  label: string;              // "Titan"
  motif: string;              // motif visuel : laurel / column / lightning / flame / wings / shield / helm / spear / obsidian
  colors: RankTierColors;
}

export const RANK_TIERS: RankTier[] = [
  {
    key: "mortel",
    label: "Mortel",
    motif: "stone",
    colors: {
      primary: "#78716c",
      secondary: "#a8a29e",
      glow: "rgba(120,113,108,0.35)",
      text: "#f5f5f4",
      gradient: "linear-gradient(90deg,#57534e 0%,#a8a29e 100%)",
    },
  },
  {
    key: "guerrier",
    label: "Guerrier",
    motif: "shield",
    colors: {
      primary: "#b45309",
      secondary: "#cd7f32",
      glow: "rgba(205,127,50,0.45)",
      text: "#fef3c7",
      gradient: "linear-gradient(90deg,#78350f 0%,#cd7f32 60%,#f59e0b 100%)",
    },
  },
  {
    key: "heros",
    label: "Héros",
    motif: "helm",
    colors: {
      primary: "#94a3b8",
      secondary: "#e2e8f0",
      glow: "rgba(226,232,240,0.55)",
      text: "#f8fafc",
      gradient: "linear-gradient(90deg,#475569 0%,#cbd5e1 60%,#f1f5f9 100%)",
    },
  },
  {
    key: "titan",
    label: "Titan",
    motif: "flame",
    colors: {
      primary: "#b91c1c",
      secondary: "#ef4444",
      glow: "rgba(239,68,68,0.55)",
      text: "#fee2e2",
      gradient: "linear-gradient(90deg,#7f1d1d 0%,#dc2626 55%,#f87171 100%)",
    },
  },
  {
    key: "olympien",
    label: "Olympien",
    motif: "lightning",
    colors: {
      primary: "#2563eb",
      secondary: "#eab308",
      glow: "rgba(234,179,8,0.6)",
      text: "#fef9c3",
      gradient: "linear-gradient(90deg,#1e3a8a 0%,#3b82f6 45%,#eab308 100%)",
    },
  },
  {
    key: "primordial",
    label: "Primordial",
    motif: "cosmos",
    colors: {
      primary: "#7c3aed",
      secondary: "#f8fafc",
      glow: "rgba(124,58,237,0.7)",
      text: "#f5f3ff",
      gradient:
        "linear-gradient(90deg,#0c0a1f 0%,#4c1d95 40%,#a78bfa 75%,#f8fafc 100%)",
    },
  },
];

export const LEVELS_PER_RANK = 5;
export const TOTAL_TIERS = RANK_TIERS.length * LEVELS_PER_RANK; // 30

/**
 * État affichable d'un rang. Le calcul du tierIndex vit désormais dans
 * `lib/fitness/rank/engine.ts` (moteur Rang/Maîtrise, basé sur la force
 * relative + confirmation dans le temps pour Olympien/Primordial — plus sur
 * une XP cumulative). Les champs xp/currentTierXp/nextTierXp/xpToNext
 * portent ici un pourcentage de Maîtrise (0..100), pas une XP.
 */
export interface RankState {
  tierIndex: number;        // 0..29
  rank: RankTier;           // Titan
  levelInRank: number;      // 1..5
  romanLevel: string;       // "III"
  fullName: string;         // "Titan III"
  xp: number;               // Maîtrise (0..100)
  currentTierXp: number;    // Maîtrise (0..100)
  nextTierXp: number;       // toujours 100
  xpToNext: number;         // 100 - Maîtrise
  progress: number;         // 0..1
  isMax: boolean;
}

// ============================================================
// Coefficient de difficulté par exercice
// ============================================================

interface DifficultyRule {
  pattern: RegExp;
  coef: number;
}

const DIFFICULTY_RULES: DifficultyRule[] = [
  { pattern: /soulev(e|é) de terre|deadlift/, coef: 2.0 },
  { pattern: /\bsquat\b|hack squat|front squat|goblet/, coef: 1.8 },
  { pattern: /d(e|é)velopp(e|é) couch(e|é)|bench press/, coef: 1.6 },
  { pattern: /d(e|é)velopp(e|é) militaire|overhead press|d(e|é)velopp(e|é) nuque/, coef: 1.6 },
  { pattern: /traction|pull ?up|chin ?up/, coef: 1.6 },
  { pattern: /\bdips?\b/, coef: 1.5 },
  { pattern: /rowing|d(e|é)velopp(e|é)|presse|fentes?|lunge|clean|snatch|thruster/, coef: 1.4 },
  { pattern: /machine convergente|smith/, coef: 1.2 },
  { pattern: /\bmachine\b|guid(e|é)/, coef: 1.1 },
  { pattern: /curl|extension|(e|é)cart(e|é)|(e|é)l(e|é)vation|kickback|pull ?over|shrug|crunch|leg raise/, coef: 1.0 },
];

export function exerciseDifficulty(name: string): number {
  const n = normalize(name);
  for (const rule of DIFFICULTY_RULES) {
    if (rule.pattern.test(n)) return rule.coef;
  }
  return 1.2;
}
