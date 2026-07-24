// ============================================================
// Illustrations de récompense — écran de fin de séance.
//
// Distinct de `assets/ranks/` (illustrations "portrait" 4:5 des rangs par
// exercice) : ici, une illustration "trophée" par rang, pensée pour être
// affichée seule, en grand, centrée (`object-fit: contain`) sur l'écran de
// récompense. Même mécanisme de découverte : déposer `<clé-de-rang>.webp`
// dans ce dossier suffit à l'activer, aucune modification de code requise.
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";

const RANK_KEYS = new Set<string>(RANK_TIERS.map((tier) => tier.key));

const trophies = import.meta.glob<{ default: string }>("./*.webp", {
  eager: true,
});

const REWARD_TROPHIES: Partial<Record<RankKey, string>> = {};

for (const [path, mod] of Object.entries(trophies)) {
  const name = path.replace("./", "").replace(/\.webp$/, "");
  if (RANK_KEYS.has(name)) {
    REWARD_TROPHIES[name as RankKey] = mod.default;
  }
}

/** Illustration de récompense du rang demandé, ou `null` si elle n'existe pas encore. */
export function getRewardTrophy(key: RankKey): string | null {
  return REWARD_TROPHIES[key] ?? null;
}
