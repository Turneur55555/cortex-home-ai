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
 * Profil d'ambiance par rang — ce qui rend chaque rang identifiable même
 * sans l'illustration : profondeur (halo plus ou moins large/diffus), grain
 * (plus ou moins marqué, plus ou moins fin), relief (bevel plus ou moins
 * net), intensité du matériau (surface/bordure plus ou moins saturées, pour
 * ne plus lire comme "transparent"), rythme du halo ambiant et de l'éclat
 * de lumière (lent et vaste pour le cosmos, vif et pulsé pour la lave).
 * Une seule table, indexée par rang — pas un système par composant.
 */
interface RankAmbiance {
  /** Étalement du halo (blur), en px — plus grand = plus diffus/vaste. */
  shadowBlur: number;
  /** Contraction du halo (spread négatif), en px. */
  shadowSpread: number;
  /** Intensité du grain de matériau (0..1) — coarse/lourd vs fin/discret. */
  grainOpacity: number;
  /** Taille du motif de grain, en px — grand = grain grossier (pierre), petit = fin (cristal). */
  grainScale: number;
  /** Netteté du relief (bevel) en haut des surfaces (0..1). */
  reliefAlpha: number;
  /** Durée d'un cycle de respiration du halo ambiant, en secondes. */
  haloDuration: number;
  /** % de couleur du rang mélangée aux surfaces/cartes (color-mix) — matériau franc, pas transparence. */
  surfaceMix: number;
  /** % de couleur du rang mélangée aux bordures/séparateurs — bordure intégrée au matériau. */
  borderMix: number;
  /** Durée d'un passage de l'éclat de lumière ambiant (glint), en secondes. */
  sweepDuration: number;
}

export const RANK_AMBIANCE: Record<RankKey, RankAmbiance> = {
  // stone — froide, lourde, minérale, sobre : grain grossier, très peu de glow, halo lent et étroit.
  mortel: {
    shadowBlur: 20,
    shadowSpread: -12,
    grainOpacity: 0.55,
    grainScale: 200,
    reliefAlpha: 0.04,
    haloDuration: 8,
    surfaceMix: 16,
    borderMix: 22,
    sweepDuration: 14,
  },
  // shield — cuivre/forge, chaude et martiale : reflets cuivrés, braises décoratives discrètes.
  guerrier: {
    shadowBlur: 28,
    shadowSpread: -14,
    grainOpacity: 0.4,
    grainScale: 130,
    reliefAlpha: 0.1,
    haloDuration: 4.5,
    surfaceMix: 24,
    borderMix: 30,
    sweepDuration: 6,
  },
  // helm — acier bleuté, noble et lumineuse : reflets métalliques nets, énergie discrète.
  heros: {
    shadowBlur: 32,
    shadowSpread: -16,
    grainOpacity: 0.28,
    grainScale: 90,
    reliefAlpha: 0.13,
    haloDuration: 4,
    surfaceMix: 20,
    borderMix: 26,
    sweepDuration: 5,
  },
  // flame — lave/magma, brutale et explosive : halo large et chaud, pulsation rapide et nerveuse.
  titan: {
    shadowBlur: 46,
    shadowSpread: -16,
    grainOpacity: 0.48,
    grainScale: 150,
    reliefAlpha: 0.09,
    haloDuration: 2,
    surfaceMix: 26,
    borderMix: 34,
    sweepDuration: 3,
  },
  // lightning — or poli/marbre, divine et prestigieuse : relief net et brillant, éclats lumineux fréquents.
  olympien: {
    shadowBlur: 42,
    shadowSpread: -8,
    grainOpacity: 0.22,
    grainScale: 100,
    reliefAlpha: 0.16,
    haloDuration: 3.2,
    surfaceMix: 22,
    borderMix: 32,
    sweepDuration: 4.5,
  },
  // cosmos — argent/cristal, mystique et intemporelle : grain le plus fin, halo le plus vaste et le plus lent.
  primordial: {
    shadowBlur: 60,
    shadowSpread: -4,
    grainOpacity: 0.18,
    grainScale: 70,
    reliefAlpha: 0.14,
    haloDuration: 9,
    surfaceMix: 18,
    borderMix: 28,
    sweepDuration: 10,
  },
};

/** Bevel/relief haut de surface, teinté par le texte du rang (clair), intensité par ambiance. */
export function rankRelief(theme: RankTheme, alpha: number): string {
  return `inset 0 1px 0 ${theme.text}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}, inset 0 -12px 24px -16px rgba(0,0,0,0.5)`;
}

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
 * (`color-mix`, intensité propre au rang via `surfaceMix`/`borderMix`) vers
 * la couleur officielle du rang, pour donner aux cartes/dialogs/sheets/
 * séparateurs un vrai "matériau" — pas un aplat transparent identique pour
 * les 6 rangs — sans jamais sortir de la direction artistique sombre
 * existante.
 *
 * `--shadow-card`/`--shadow-elevated` (déjà utilisées par `.shadow-card`/
 * `.shadow-elevated` dans toute l'app) embarquent en plus le relief/l'ambiance
 * du rang (RANK_AMBIANCE) : c'est ce qui rend un rang identifiable à la
 * silhouette de l'interface, pas seulement à sa couleur — sans qu'aucun
 * composant existant ou futur n'ait à changer une ligne pour en hériter.
 */
export function applyRankTheme(key: RankKey): void {
  const theme = rankThemeByKey(key);
  const ambiance = RANK_AMBIANCE[key];
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
  root.style.setProperty(
    "--shadow-glow",
    rankGlowShadow(theme.glow, 0, ambiance.shadowBlur, ambiance.shadowSpread),
  );

  // Matériaux : surfaces/cartes/bordures/séparateurs — intensité (surfaceMix/
  // borderMix) propre au rang, pour que le matériau se voie (plus de cartes
  // "transparentes") au lieu d'une teinte flottante identique partout.
  //
  // Important : la base mélangée doit être STRICTEMENT neutre (chroma 0) —
  // toute teinte résiduelle (l'ancien violet fixe, oklch(... 280)) fausserait
  // la couleur perçue de chaque matériau (un gris Mortel ou un rouge Titan
  // reviendrait légèrement violet). D'où oklch(L 0 0) ci-dessous.
  root.style.setProperty(
    "--surface",
    `color-mix(in oklch, ${theme.primary} ${ambiance.surfaceMix}%, oklch(0.16 0 0))`,
  );
  root.style.setProperty(
    "--surface-elevated",
    `color-mix(in oklch, ${theme.primary} ${ambiance.surfaceMix + 2}%, oklch(0.19 0 0))`,
  );
  root.style.setProperty(
    "--card",
    `color-mix(in oklch, ${theme.primary} ${ambiance.surfaceMix}%, oklch(0.16 0 0))`,
  );
  root.style.setProperty(
    "--border",
    `color-mix(in oklch, ${theme.secondary} ${ambiance.borderMix}%, oklch(1 0 0 / 0.06))`,
  );
  // Dégradé à 3 tons (au lieu d'un simple fondu vertical) : suggère une
  // surface éclairée d'un côté, comme un vrai matériau, pas un aplat.
  root.style.setProperty(
    "--gradient-surface",
    `linear-gradient(165deg, ` +
      `color-mix(in oklch, ${theme.primary} ${ambiance.surfaceMix + 8}%, oklch(0.19 0 0)) 0%, ` +
      `color-mix(in oklch, ${theme.primary} ${ambiance.surfaceMix}%, oklch(0.16 0 0)) 55%, ` +
      `color-mix(in oklch, ${theme.primary} ${Math.max(ambiance.surfaceMix - 8, 0)}%, oklch(0.13 0 0)) 100%)`,
  );
  root.style.setProperty("--material-grain", MATERIAL_GRAIN);
  root.style.setProperty("--rank-grain-opacity", String(ambiance.grainOpacity));
  root.style.setProperty("--rank-grain-scale", `${ambiance.grainScale}px`);
  root.style.setProperty("--rank-halo-duration", `${ambiance.haloDuration}s`);
  root.style.setProperty("--rank-sweep-duration", `${ambiance.sweepDuration}s`);

  // Profondeur/relief : réutilisées par shadow-card/shadow-elevated (95+
  // fichiers déjà consommateurs), donc héritées sans implémentation propre.
  const relief = rankRelief(theme, ambiance.reliefAlpha);
  root.style.setProperty("--shadow-card", `${relief}, 0 8px 24px -8px oklch(0 0 0 / 0.5)`);
  root.style.setProperty(
    "--shadow-elevated",
    `${relief}, 0 16px 40px -12px oklch(0 0 0 / 0.5), 0 0 ${ambiance.shadowBlur}px -8px ${theme.glow}`,
  );
}
