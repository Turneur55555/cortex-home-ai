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

/**
 * Grain de matériau — bruit procédural partagé par les 6 rangs (une seule
 * texture, jamais réinventée par rang : ce qui différencie le "métal" perçu
 * d'un rang à l'autre, c'est la couleur en dessous, pas l'algorithme de
 * bruit). Généré une fois au chargement du module, appliqué en
 * `mix-blend-mode: overlay` par `.bg-rank-grain` (styles.css) — donne un
 * relief de surface (acier brossé, martelé, grain de pierre…) sans aucun
 * fichier de texture, conformément à la règle « seules les illustrations
 * officielles sont des assets artistiques ».
 */
const GRAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">' +
  '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="noise"/>' +
  '<feColorMatrix in="noise" type="saturate" values="0"/></filter>' +
  '<rect width="100%" height="100%" filter="url(#n)"/></svg>';

export const MATERIAL_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

/**
 * Applique le thème du rang courant à toute l'application, en recolorant les
 * variables CSS partagées (`:root`, voir `styles.css`) que les utilitaires
 * Tailwind (`bg-primary`, `ring-ring`, `shadow-glow`, `bg-card`, `bg-surface`,
 * bordures par défaut…) référencent déjà partout dans l'app. Remplace
 * l'ancien `applyAccent` (couleur d'accent utilisateur, retirée) : le rang
 * est désormais l'unique source de l'identité visuelle de Cortex — aucun
 * composant n'a besoin de connaître le rang pour en hériter la couleur, il
 * lui suffit d'utiliser les tokens existants.
 *
 * `--surface`/`--card`/`--border`/`--gradient-surface` restent volontairement
 * sombres (le fond de l'app ne change pas) — seule leur teinte dérive
 * légèrement (`color-mix`) vers la couleur officielle du rang, pour donner
 * aux cartes/dialogs/sheets/séparateurs un "matériau" cohérent avec le rang
 * sans jamais sortir de la direction artistique sombre existante.
 */
export function applyRankTheme(key: RankKey): void {
  const theme = rankThemeByKey(key);
  const root = document.documentElement;

  // Accent / halos / boutons / focus (déjà en place).
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-glow", theme.secondary);
  root.style.setProperty("--primary-glow-soft", theme.glow);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--gradient-primary", theme.gradient);
  root.style.setProperty(
    "--gradient-glow",
    `radial-gradient(circle at 50% 0%, ${theme.glow}, transparent 60%)`,
  );
  root.style.setProperty("--shadow-glow", rankGlowShadow(theme.glow, 0, 32, -4));

  // Matériaux : surfaces/cartes/bordures/séparateurs (nouveau).
  root.style.setProperty(
    "--surface",
    `color-mix(in oklch, ${theme.primary} 14%, oklch(0.16 0.02 280))`,
  );
  root.style.setProperty(
    "--surface-elevated",
    `color-mix(in oklch, ${theme.primary} 16%, oklch(0.19 0.025 280))`,
  );
  root.style.setProperty(
    "--card",
    `color-mix(in oklch, ${theme.primary} 14%, oklch(0.16 0.02 280))`,
  );
  root.style.setProperty(
    "--border",
    `color-mix(in oklch, ${theme.secondary} 20%, oklch(1 0 0 / 0.06))`,
  );
  root.style.setProperty(
    "--gradient-surface",
    `linear-gradient(180deg, color-mix(in oklch, ${theme.primary} 18%, oklch(0.18 0.022 280)), color-mix(in oklch, ${theme.primary} 10%, oklch(0.14 0.018 280)))`,
  );
  root.style.setProperty("--material-grain", MATERIAL_GRAIN);
}
