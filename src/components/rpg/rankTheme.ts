// ============================================================
// RankTheme — UNIQUE système de thème piloté par le rang.
//
// Toute couleur affichée pour un rang (Mortel..Primordial) doit transiter
// par ce module : une seule source de données (`RANK_TIERS` dans
// `exerciseRanks.ts`), un seul point d'accès (`rankTierByKey` /
// `rankThemeByKey`), un seul jeu de formules pour les effets visuels
// récurrents (halo, liseré, glow de texte). Aucun composant ne doit
// réassembler une chaîne `boxShadow`/`textShadow` à partir de
// `rank.colors.*` en dehors de ces helpers.
//
// Purement fonctionnel, zéro import React — comme `premium/tokens.ts`,
// dont les courbes d'animation restent la seule source pour le motion
// (aucun chevauchement : ce fichier ne connaît que la couleur).
// ============================================================

import {
  RANK_TIERS,
  type RankKey,
  type RankTier,
  type RankTierColors,
} from "@/lib/fitness/exerciseRanks";

/** Alias public : le thème d'un rang, c'est son jeu de couleurs officiel. */
export type RankTheme = RankTierColors;

const TIERS_BY_KEY = new Map<RankKey, RankTier>(RANK_TIERS.map((tier) => [tier.key, tier]));

/** Rang complet (label, motif, couleurs) pour une clé donnée. */
export function rankTierByKey(key: RankKey): RankTier {
  const tier = TIERS_BY_KEY.get(key);
  if (!tier) {
    throw new Error(`RankTheme: clé de rang inconnue "${key}"`);
  }
  return tier;
}

/** Thème (couleurs) d'un rang pour une clé donnée. */
export function rankThemeByKey(key: RankKey): RankTheme {
  return rankTierByKey(key).colors;
}

/** Liseré intérieur teinté par la couleur dominante du rang (ring "premium"). */
export function rankRingInset(primary: string, alphaHex = "30"): string {
  return `inset 0 0 0 1px ${primary}${alphaHex}`;
}

/** Ombre portée diffuse, teintée par le halo du rang (élévation "précieuse"). */
export function rankGlowShadow(glow: string, y: number, blur: number, spread: number): string {
  return `${y}px ${blur}px ${spread}px ${glow}`;
}

/** Combine liseré + halo — le habillage de surface le plus fréquent (cartes, boutons). */
export function rankSurfaceShadow(
  theme: Pick<RankTheme, "primary" | "glow">,
  opts: { ringAlpha?: string; y: number; blur: number; spread: number },
): string {
  const { ringAlpha = "30", y, blur, spread } = opts;
  return `${rankRingInset(theme.primary, ringAlpha)}, ${rankGlowShadow(theme.glow, y, blur, spread)}`;
}

/** Lueur de texte teintée par le halo du rang, avec une seconde ombre optionnelle. */
export function rankTextGlow(glow: string, blur: number, extra?: string): string {
  return extra ? `0 0 ${blur}px ${glow}, ${extra}` : `0 0 ${blur}px ${glow}`;
}
