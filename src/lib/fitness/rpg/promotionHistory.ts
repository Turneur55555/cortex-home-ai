// ============================================================
// Historique des promotions — dérivations PURES (zéro React, zéro
// Supabase). Consomme les lignes brutes de `rank_promotions` (tier_index
// + xp_at_promotion + created_at, écrites automatiquement en base par le
// trigger `record_rank_promotions`) et les projette sur l'échelle
// Titre/Grade déjà existante (`titleConfig.ts`, `RANK_TIERS`).
//
// Ne recalcule AUCUN seuil XP, AUCUN Titre/Grade : réutilise exactement
// la même config que `titleProgress.ts` pour qu'un palier se nomme
// toujours pareil ici et sur le reste du profil.
// ============================================================

import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";
import { GRADE_NAMES_BY_TITLE, LEVELS_PER_TITLE } from "./titleConfig";

export type PromotionRow = {
  tier_index: number;
  xp_at_promotion: number;
  created_at: string;
};

export type PromotionEvent = {
  tierIndex: number;
  /** true = déblocage d'un nouveau Rang (1er Grade d'un Titre), false = simple montée de Grade. */
  isRankUp: boolean;
  rankKey: RankKey;
  rankLabel: string;
  gradeLabel: string;
  xp: number;
  date: string; // ISO, tel qu'écrit en base
};

/** Construit les événements d'affichage, du plus récent au plus ancien. */
export function buildPromotionEvents(rows: PromotionRow[]): PromotionEvent[] {
  return [...rows]
    .sort((a, b) => b.tier_index - a.tier_index)
    .map((row) => {
      const titleIndex = Math.floor(row.tier_index / LEVELS_PER_TITLE);
      const gradeIndex = row.tier_index % LEVELS_PER_TITLE;
      const title = RANK_TIERS[titleIndex];
      return {
        tierIndex: row.tier_index,
        isRankUp: gradeIndex === 0,
        rankKey: title.key,
        rankLabel: title.label,
        gradeLabel: GRADE_NAMES_BY_TITLE[title.key][gradeIndex],
        xp: row.xp_at_promotion,
        date: row.created_at,
      };
    });
}
