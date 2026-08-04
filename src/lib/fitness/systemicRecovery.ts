// Pure domain logic — Récupération SYSTÉMIQUE (Phase 10 §8), tuile
// "Récupération" de Santé nutritionnelle. No React, no Supabase.
//
// À NE PAS CONFONDRE avec `recovery.ts` (`computeRecovery`/`RecoveryStatus`)
// — celui-ci calcule la récupération PAR GROUPE MUSCULAIRE pour le
// BodyMap/MuscleMap (fenêtre de récupération après une séance), une
// fonctionnalité distincte et déjà en production, jamais dupliquée ici.
// Ce fichier calcule un signal de récupération GLOBAL/systémique, sans
// rapport avec un muscle précis — d'où le préfixe "Systemic" pour éviter
// toute confusion de nommage.
//
// Doctrine explicite du brief Phase 10 §8 : PAS de score pseudo-
// scientifique arbitraire (pas de "0-100" fabriqué), PAS de sommeil dans
// le calcul (Cortex ne mesure pas le sommeil), et un signal construit sur
// la BASELINE PERSONNELLE plutôt que des seuils génériques de population.
//
// Composante retenue : UNIQUEMENT la fréquence cardiaque de repos (FC
// repos), comparée à la moyenne personnelle des mesures précédentes —
// c'est le signal de récupération le mieux établi et le plus simple à
// justifier avec les données que Cortex peut réellement collecter
// aujourd'hui (saisie manuelle ou import futur, `daily_activity.
// resting_hr`). La HRV est délibérément EXCLUE de ce calcul : sa valeur
// dépend fortement de la méthode/de l'appareil de mesure (§7 du brief —
// "ne compare pas aveuglément des séries provenant de méthodes
// incompatibles"), et Cortex ne connaît pas encore la provenance de chaque
// mesure HRV avec assez de certitude pour l'intégrer sans risque de faux
// signal — elle reste affichée séparément, jamais fusionnée dans ce score.
// La charge d'entraînement récente n'est PAS non plus intégrée au statut :
// la combiner défendablement avec la FC repos demanderait un modèle plus
// complexe que ce que la donnée actuelle justifie — elle reste visible
// séparément dans Fitness, comme contexte, jamais comme composante ici.
//
// Si l'historique est insuffisant pour établir une baseline personnelle,
// le statut est explicitement "insufficient_data" — jamais une valeur
// inventée pour combler le vide.

export type SystemicRecoveryStatus = "insufficient_data" | "reduced" | "normal" | "recovered";

export const SYSTEMIC_RECOVERY_THRESHOLDS = {
  /** Mesures de FC repos antérieures minimales pour établir une baseline personnelle. */
  MIN_BASELINE_SAMPLES: 5,
  /** Fenêtre de mesures antérieures prises en compte pour la baseline (jours). */
  BASELINE_WINDOW_SIZE: 14,
  /**
   * Écart (bpm) au-delà duquel un écart à la baseline est considéré
   * significatif — règle produit PRUDENTE, pas une certitude physiologique
   * (documentée comme telle, même esprit que MAINTENANCE_ZONE_PERCENT dans
   * goalTrajectory.ts). Une variation de ±2 bpm est considérée bruit normal.
   */
  SIGNIFICANT_DELTA_BPM: 3,
} as const;

export interface RestingHrSample {
  date: string;
  restingHr: number;
}

export interface SystemicRecoveryResult {
  status: SystemicRecoveryStatus;
  latestRestingHr: number | null;
  latestDate: string | null;
  baselineRestingHr: number | null;
  baselineSampleCount: number;
  /**
   * Nombre de mesures de FC repos ENCORE nécessaires avant de pouvoir
   * établir une baseline personnelle — `0` dès que le statut n'est plus
   * `insufficient_data`. Calculé dynamiquement (jamais un texte statique
   * codé en dur côté UI, Phase 10 — correctif de clôture §4) : `1` mesure
   * "la plus récente" + `MIN_BASELINE_SAMPLES` mesures antérieures.
   */
  remainingBaselineSamples: number;
  deltaBpm: number | null;
  reason: string;
}

/**
 * `samples` : historique de FC repos (une valeur par jour, déjà fusionnée
 * par `mergeDailyActivityRows` en amont), dans N'IMPORTE QUEL ORDRE — trié
 * ici en interne. Le plus RÉCENT sert de "aujourd'hui", tous les autres
 * (jusqu'à `BASELINE_WINDOW_SIZE`) forment la baseline personnelle.
 */
export function evaluateSystemicRecovery(
  samples: readonly RestingHrSample[],
): SystemicRecoveryResult {
  const sorted = [...samples]
    .filter((s) => Number.isFinite(s.restingHr) && s.restingHr > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // "la plus récente" + MIN_BASELINE_SAMPLES antérieures — calculé une
  // seule fois, jamais un chiffre statique dupliqué dans l'UI.
  const totalNeeded = SYSTEMIC_RECOVERY_THRESHOLDS.MIN_BASELINE_SAMPLES + 1;
  const remaining = Math.max(0, totalNeeded - sorted.length);

  if (sorted.length === 0) {
    return {
      status: "insufficient_data",
      latestRestingHr: null,
      latestDate: null,
      baselineRestingHr: null,
      baselineSampleCount: 0,
      remainingBaselineSamples: remaining,
      deltaBpm: null,
      reason: `Encore ${remaining} mesure${remaining > 1 ? "s" : ""} de FC au repos nécessaire${remaining > 1 ? "s" : ""} pour établir ta référence personnelle.`,
    };
  }

  const [latest, ...rest] = sorted;
  const baselinePool = rest.slice(0, SYSTEMIC_RECOVERY_THRESHOLDS.BASELINE_WINDOW_SIZE);

  if (baselinePool.length < SYSTEMIC_RECOVERY_THRESHOLDS.MIN_BASELINE_SAMPLES) {
    return {
      status: "insufficient_data",
      latestRestingHr: latest.restingHr,
      latestDate: latest.date,
      baselineRestingHr: null,
      baselineSampleCount: baselinePool.length,
      remainingBaselineSamples: remaining,
      deltaBpm: null,
      reason: `Encore ${remaining} mesure${remaining > 1 ? "s" : ""} de FC au repos nécessaire${remaining > 1 ? "s" : ""} pour établir ta référence personnelle.`,
    };
  }

  const baselineRestingHr =
    Math.round((baselinePool.reduce((s, p) => s + p.restingHr, 0) / baselinePool.length) * 10) / 10;
  const deltaBpm = Math.round((latest.restingHr - baselineRestingHr) * 10) / 10;

  let status: SystemicRecoveryStatus;
  let reason: string;
  if (deltaBpm >= SYSTEMIC_RECOVERY_THRESHOLDS.SIGNIFICANT_DELTA_BPM) {
    status = "reduced";
    reason = `FC repos ${deltaBpm} bpm au-dessus de ta moyenne personnelle (${baselineRestingHr} bpm) — signe possible de récupération incomplète.`;
  } else if (deltaBpm <= -SYSTEMIC_RECOVERY_THRESHOLDS.SIGNIFICANT_DELTA_BPM) {
    status = "recovered";
    reason = `FC repos ${Math.abs(deltaBpm)} bpm en dessous de ta moyenne personnelle (${baselineRestingHr} bpm) — signe favorable.`;
  } else {
    status = "normal";
    reason = `FC repos proche de ta moyenne personnelle (${baselineRestingHr} bpm).`;
  }

  return {
    status,
    latestRestingHr: latest.restingHr,
    latestDate: latest.date,
    baselineRestingHr,
    baselineSampleCount: baselinePool.length,
    remainingBaselineSamples: 0,
    deltaBpm,
    reason,
  };
}
