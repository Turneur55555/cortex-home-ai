// ============================================================
// Illustrations de Rang — source unique des visuels de la carte de rang.
//
// Chaque rang a son illustration : `assets/ranks/<clé>.webp`. Déposer un
// fichier ici suffit à l'activer, aucune modification de code n'est requise
// (import.meta.glob découvre les fichiers au build). Si l'illustration d'un
// rang est absente, on retombe sur celle du rang précédent le plus proche.
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";

const RANK_ORDER: RankKey[] = RANK_TIERS.map((tier) => tier.key);

const illustrations = import.meta.glob<{ default: string }>("./*.webp", {
  eager: true,
});

const RANK_ILLUSTRATIONS: Partial<Record<RankKey, string>> = {};

for (const [path, mod] of Object.entries(illustrations)) {
  const key = path.replace("./", "").replace(/\.webp$/, "");
  RANK_ILLUSTRATIONS[key as RankKey] = mod.default;
}

/**
 * Illustration du rang demandé, ou celle du rang précédent le plus proche
 * si absente. Retourne `null` si aucune illustration n'est disponible.
 */
export function getRankIllustration(key: RankKey): string | null {
  const startIndex = RANK_ORDER.indexOf(key);
  for (let i = startIndex; i >= 0; i--) {
    const fallback = RANK_ILLUSTRATIONS[RANK_ORDER[i]];
    if (fallback) return fallback;
  }
  return null;
}
