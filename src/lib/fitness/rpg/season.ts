// ============================================================
// Saisons — dérivations d'affichage (domaine pur, zéro React).
//
// MIROIR de la courbe serveur `compute_season_tier` (migration
// 20260717130000) : tier = floor(ps / PS_PER_TIER), plafonné à MAX_TIER.
// Le serveur reste l'autorité qui ÉCRIT ps/tier ; ce module ne fait que
// dériver la progression intra-palier et l'état temporel pour l'affichage.
//
// ⚠️ Courbe PLACEHOLDER destinée à être CALIBRÉE sur données réelles en S0.
// Si les constantes serveur changent, aligner PS_PER_TIER / MAX_TIER ici.
// ============================================================

/** Points de Saison par palier (placeholder : ~1 séance muscu = 1 palier). */
export const PS_PER_TIER = 100;
/** Nombre de paliers du track de saison. */
export const MAX_TIER = 50;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Palier atteint pour un total de PS — identique au calcul serveur. */
export function computeSeasonTier(ps: number): number {
  const safe = Math.max(0, ps);
  return Math.min(MAX_TIER, Math.floor(safe / PS_PER_TIER));
}

export interface SeasonTierProgress {
  tier: number;
  ps: number;
  /** true quand le palier maximum est atteint. */
  isMax: boolean;
  /** PS au début du palier courant. */
  tierStartPs: number;
  /** PS au début du palier suivant (= tierStartPs si max). */
  nextTierPs: number;
  /** PS acquis dans le palier courant. */
  psIntoTier: number;
  /** Largeur (en PS) d'un palier. */
  psForTier: number;
  /** PS restants avant le palier suivant (0 si max). */
  psToNext: number;
  /** Progression dans le palier courant, 0..1 (1 si max). */
  progress: number;
}

/** Progression d'affichage dans le palier courant pour un total de PS. */
export function seasonTierProgress(ps: number): SeasonTierProgress {
  const safe = Math.max(0, Math.floor(ps));
  const tier = computeSeasonTier(safe);
  const isMax = tier >= MAX_TIER;
  const tierStartPs = tier * PS_PER_TIER;
  const nextTierPs = isMax ? tierStartPs : (tier + 1) * PS_PER_TIER;
  const psForTier = PS_PER_TIER;
  const psIntoTier = isMax ? PS_PER_TIER : safe - tierStartPs;
  const psToNext = isMax ? 0 : nextTierPs - safe;
  const progress = isMax ? 1 : Math.min(1, psIntoTier / psForTier);
  return {
    tier,
    ps: safe,
    isMax,
    tierStartPs,
    nextTierPs,
    psIntoTier,
    psForTier,
    psToNext,
    progress,
  };
}

/** Jours (entiers, plancher 0) restants avant la fin de la saison. */
export function seasonDaysRemaining(endsAtISO: string, now: Date = new Date()): number {
  const end = new Date(endsAtISO).getTime();
  const diff = end - now.getTime();
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

/** Progression temporelle dans la fenêtre de saison, 0..1. */
export function seasonTimeProgress(
  startsAtISO: string,
  endsAtISO: string,
  now: Date = new Date(),
): number {
  const start = new Date(startsAtISO).getTime();
  const end = new Date(endsAtISO).getTime();
  const span = end - start;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (now.getTime() - start) / span));
}
