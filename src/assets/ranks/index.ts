// ============================================================
// Illustrations de Rang — source unique des visuels de rang de CORTEX.
//
// Chaque rang a son illustration : `assets/ranks/<clé>.webp`. Déposer un
// fichier ici suffit à l'activer, aucune modification de code n'est requise
// (import.meta.glob découvre les fichiers au build). Format que toute
// illustration doit respecter pour s'intégrer sans adaptation : voir
// `FORMAT.md` dans ce dossier.
//
// Un rang n'affiche JAMAIS l'illustration d'un autre rang : si la sienne est
// absente, `RankIllustration` retombe sur `placeholder.webp` (déposer ce
// fichier ici l'active, même mécanisme) puis, à défaut, sur une carte
// « Illustration à venir ».
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";

const RANK_KEYS = new Set<string>(RANK_TIERS.map((tier) => tier.key));

const illustrations = import.meta.glob<{ default: string }>("./*.webp", {
  eager: true,
});

const RANK_ILLUSTRATIONS: Partial<Record<RankKey, string>> = {};
let PLACEHOLDER_ILLUSTRATION: string | null = null;

for (const [path, mod] of Object.entries(illustrations)) {
  const name = path.replace("./", "").replace(/\.webp$/, "");
  if (name === "placeholder") {
    PLACEHOLDER_ILLUSTRATION = mod.default;
  } else if (RANK_KEYS.has(name)) {
    RANK_ILLUSTRATIONS[name as RankKey] = mod.default;
  }
}

/** Illustration officielle du rang demandé, ou `null` si elle n'existe pas encore. */
export function getRankIllustration(key: RankKey): string | null {
  return RANK_ILLUSTRATIONS[key] ?? null;
}

/** Illustration neutre partagée, affichée le temps qu'un rang reçoive la sienne. */
export function getPlaceholderIllustration(): string | null {
  return PLACEHOLDER_ILLUSTRATION;
}
