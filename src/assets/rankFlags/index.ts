// ============================================================
// Fanions de rang — identité visuelle officielle du rang RPG dans les
// contextes compacts (carte d'exercice en séance). Distinct de
// `assets/ranks/` (illustration portrait 4:5 pleine page, Hero/récompenses/
// montées de rang) : le fanion est un bandeau horizontal auto-porteur (icône
// + nom déjà gravés dans l'image), pensé pour remplacer le texte coloré de
// rang partout où l'espace est restreint. Même mécanisme de dépôt : un
// fichier `<clé>.webp` ici suffit à l'activer, aucune modification de code
// requise (import.meta.glob).
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";

const RANK_KEYS = new Set<string>(RANK_TIERS.map((tier) => tier.key));

const flags = import.meta.glob<{ default: string }>("./*.webp", { eager: true });

const RANK_FLAGS: Partial<Record<RankKey, string>> = {};

for (const [path, mod] of Object.entries(flags)) {
  const name = path.replace("./", "").replace(/\.webp$/, "");
  if (RANK_KEYS.has(name)) {
    RANK_FLAGS[name as RankKey] = mod.default;
  }
}

/** Fanion officiel du rang demandé, ou `null` si pas encore déposé. */
export function getRankFlag(key: RankKey): string | null {
  return RANK_FLAGS[key] ?? null;
}
