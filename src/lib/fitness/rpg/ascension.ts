// ============================================================
// Historique des Ascensions — dérivations PURES (zéro React, zéro
// Supabase). Une Ascension = un changement de TITRE (Mortel→Guerrier→
// Héros→Colosse→Olympien→Titan), dérivé de la Puissance Cortex — jamais
// de l'XP. Voir `supabase/migrations/20260829150000_cortex_ascension_
// history.sql` pour les garde-fous serveur (progression strictement
// croissante, uniquement au changement de Titre).
//
// Fusionne deux sources, jamais fabriquées l'une à partir de l'autre :
//   - `rank_promotions` (ère XP, gelée — plus aucune écriture depuis la
//     suppression du trigger XP → tier) : historique conservé tel quel,
//     rendu comme événements "legacy".
//   - `cortex_ascensions` (nouveau moteur, seule source vivante) : rendu
//     comme événements "ascension".
// ============================================================

import { RANK_TIERS, LEVELS_PER_RANK, type RankKey, type RankTier } from "@/lib/fitness/exerciseRanks";
import { GRADE_NAMES_BY_TITLE } from "./titleConfig";

function titleForTierIndex(tierIndex: number): RankTier {
  return RANK_TIERS[Math.floor(tierIndex / LEVELS_PER_RANK)];
}

export type LegacyPromotionRow = {
  tier_index: number;
  xp_at_promotion: number;
  created_at: string;
};

export type CortexAscensionRow = {
  tier_index: number;
  previous_tier_index: number | null;
  created_at: string;
};

export type PromotionTimelineEvent =
  | {
      source: "legacy";
      tierIndex: number;
      isRankUp: boolean;
      rankKey: RankKey;
      rankLabel: string;
      gradeLabel: string;
      xp: number;
      date: string;
    }
  | {
      source: "ascension";
      tierIndex: number;
      rankKey: RankKey;
      rankLabel: string;
      previousRankKey: RankKey | null;
      previousRankLabel: string | null;
      cortexPower: number;
      date: string;
    };

/** Événements "legacy" (ère XP) — historique gelé, jamais recalculé. */
export function buildLegacyPromotionEvents(rows: LegacyPromotionRow[]): PromotionTimelineEvent[] {
  return rows.map((row) => {
    const titleIndex = Math.floor(row.tier_index / LEVELS_PER_RANK);
    const gradeIndex = row.tier_index % LEVELS_PER_RANK;
    const title = RANK_TIERS[titleIndex];
    return {
      source: "legacy",
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

/** Événements d'Ascension (nouveau moteur, Puissance Cortex). */
export function buildCortexAscensionEvents(rows: CortexAscensionRow[]): PromotionTimelineEvent[] {
  return rows.map((row) => {
    const title = titleForTierIndex(row.tier_index);
    const previousTitle = row.previous_tier_index != null ? titleForTierIndex(row.previous_tier_index) : null;
    return {
      source: "ascension",
      tierIndex: row.tier_index,
      rankKey: title.key,
      rankLabel: title.label,
      previousRankKey: previousTitle?.key ?? null,
      previousRankLabel: previousTitle?.label ?? null,
      cortexPower: row.tier_index,
      date: row.created_at,
    };
  });
}

/**
 * Une Ascension doit-elle être déclenchée entre deux paliers de Puissance
 * Cortex ? Mirroir exact de la logique serveur (`record_cortex_ascension`,
 * migration `20260829150000`) : uniquement si le TITRE change (pas un
 * simple changement de grade) ET si la progression est strictement
 * croissante. Utilisé côté client comme pré-vérification (évite un appel
 * réseau inutile) — le serveur reste la source de vérité, cette fonction
 * ne fait que refléter la même règle pour les tests et l'UX.
 *
 * Notez l'ABSENCE totale de tout paramètre XP dans cette signature : par
 * construction, aucune valeur d'XP ne peut influencer ce calcul — seul le
 * tierIndex de Puissance Cortex (Rang exercice → Rang musculaire →
 * Puissance Cortex) entre en jeu.
 */
export function shouldTriggerAscension(
  previousTierIndex: number | null,
  newTierIndex: number,
): boolean {
  const previousTitle = previousTierIndex == null ? -1 : Math.floor(previousTierIndex / LEVELS_PER_RANK);
  const newTitle = Math.floor(newTierIndex / LEVELS_PER_RANK);
  return newTitle > previousTitle;
}

/** Fusionne legacy + ascensions, du plus récent au plus ancien. */
export function mergePromotionTimeline(
  legacy: LegacyPromotionRow[],
  ascensions: CortexAscensionRow[],
): PromotionTimelineEvent[] {
  return [...buildLegacyPromotionEvents(legacy), ...buildCortexAscensionEvents(ascensions)].sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
  );
}
