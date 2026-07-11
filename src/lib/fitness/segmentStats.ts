// ============================================================
// Statistiques génériques sur les occurrences d'un "type" de segment
// (ex. "400m allure 5 km", "Récupération trottinée", "Tempo") à travers
// toutes les séances Course à pied TERMINÉES de l'utilisateur. Pendant
// générique de src/utils/fitness/exercise-stats.ts (computePRs) et
// src/lib/fitness/progression.ts (buildSessionStats/currentBests) côté
// musculation — même philosophie (agrégation 100% côté client à partir
// des lignes réelles, aucun calcul serveur), adaptée au vocabulaire
// course (metrics jsonb libre au lieu de reps/weight fixes).
//
// Générique par construction : SEGMENT_METRIC_CONFIG est la SEULE table à
// étendre si un futur type de segment (HYROX, Cardio, mobilité...)
// introduit une nouvelle métrique numérique dans `metrics` (ex. un vrai
// `duration_s` mesuré, un jour) — aucune autre fonction ici n'a besoin de
// connaître le vocabulaire d'une discipline particulière. C'est le point
// d'extension demandé par Nathan ("prévoir une architecture permettant
// son ajout futur sans casser l'existant").
//
// N'affiche jamais de donnée fictive : une métrique absente de
// `metrics` sur toutes les occurrences n'apparaît simplement pas dans
// `SegmentStats.metrics`. Il n'existe aujourd'hui aucune mesure de temps
// réel (chrono) par segment — `estimatedDuration` est un calcul honnête
// (distance réelle × allure réelle) clairement distinct d'un chrono
// mesuré, en attendant qu'une vraie métrique de durée existe.
// ============================================================

import { normalize } from "@/lib/fitness/exerciseCatalog";
import type { Trend } from "@/lib/fitness/analysis";

export interface SegmentInstance {
  workoutId: string;
  /** Date de la séance (YYYY-MM-DD). */
  date: string;
  /** Libellé brut tel que stocké en base (peut porter un suffixe "i/n"). */
  label: string;
  metrics: Record<string, number | string>;
  completed: boolean;
}

type MetricDirection = "min" | "max";

interface MetricConfig {
  label: string;
  direction: MetricDirection;
  format: (value: number) => string;
}

function formatPaceValue(v: number): string {
  const totalSeconds = Math.round(v * 60);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${String(sec).padStart(2, "0")} min/km`;
}

// Vocabulaire connu posé par courseEngine.ts (voir formatLiveSegmentImpl).
// `zone` et `max_heart_rate` sont volontairement absents : ce sont des
// cibles/contexte, pas des métriques de performance dont on cherche un
// "meilleur" ou une progression.
export const SEGMENT_METRIC_CONFIG: Record<string, MetricConfig> = {
  distance_m: {
    label: "Distance",
    direction: "max",
    format: (v) => `${(v / 1000).toFixed(2)} km`,
  },
  pace_min_per_km: {
    label: "Allure",
    direction: "min",
    format: formatPaceValue,
  },
  elevation_m: {
    label: "Dénivelé+",
    direction: "max",
    format: (v) => `${Math.round(v)} m`,
  },
};

/** Retire le suffixe de répétition ("... 3/8") d'un libellé de segment
 *  pour obtenir son "type" stable — cf. intervalLiveSegments/hillLiveSegments
 *  dans courseEngine.ts qui numérotent ainsi chaque répétition. */
export function segmentBaseLabel(rawLabel: string): string {
  return rawLabel.replace(/\s+\d+\s*\/\s*\d+\s*$/, "").trim();
}

/** Clé d'identité stable d'un type de segment (insensible accents/casse) —
 *  même principe que normalize(exerciseName) côté musculation. */
export function segmentTypeKey(rawLabel: string): string {
  return normalize(segmentBaseLabel(rawLabel));
}

export interface MetricStat {
  key: string;
  label: string;
  best: number;
  bestFormatted: string;
  latest: number;
  latestFormatted: string;
  progressionPct: number | null;
  trend: Trend;
  history: Array<{ date: string; value: number }>;
}

function buildStat(
  key: string,
  label: string,
  direction: MetricDirection,
  format: (v: number) => string,
  points: Array<{ date: string; value: number }>,
): MetricStat | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const values = sorted.map((p) => p.value);
  const best = direction === "min" ? Math.min(...values) : Math.max(...values);
  const first = sorted[0].value;
  const latest = sorted[sorted.length - 1].value;
  const progressionPct =
    sorted.length >= 2 && first !== 0
      ? ((direction === "min" ? first - latest : latest - first) / Math.abs(first)) * 100
      : null;
  const trend: Trend =
    progressionPct == null || Math.abs(progressionPct) < 1
      ? "flat"
      : progressionPct > 0
        ? "up"
        : "down";
  return {
    key,
    label,
    best,
    bestFormatted: format(best),
    latest,
    latestFormatted: format(latest),
    progressionPct,
    trend,
    history: sorted,
  };
}

export interface SegmentStats {
  displayLabel: string;
  /** Nombre de réalisations (occurrences complétées, toutes séances confondues). */
  occurrences: number;
  firstDate: string | null;
  lastDate: string | null;
  metrics: MetricStat[];
  /** Durée estimée (distance réelle × allure réelle) — PAS un chrono mesuré. */
  estimatedDuration: MetricStat | null;
}

/** Calcule les statistiques d'un type de segment à partir de toutes ses
 *  occurrences réelles (toutes séances Course terminées confondues). */
export function computeSegmentStats(
  displayLabel: string,
  instances: SegmentInstance[],
): SegmentStats {
  const realized = instances.filter((i) => i.completed);
  const byMetric = new Map<string, Array<{ date: string; value: number }>>();
  const durationPoints: Array<{ date: string; value: number }> = [];

  for (const inst of realized) {
    for (const [key, raw] of Object.entries(inst.metrics)) {
      if (typeof raw !== "number") continue;
      if (!SEGMENT_METRIC_CONFIG[key]) continue;
      if (!byMetric.has(key)) byMetric.set(key, []);
      byMetric.get(key)!.push({ date: inst.date, value: raw });
    }
    const distance = inst.metrics.distance_m;
    const pace = inst.metrics.pace_min_per_km;
    if (typeof distance === "number" && typeof pace === "number") {
      durationPoints.push({ date: inst.date, value: (distance / 1000) * pace });
    }
  }

  const metrics: MetricStat[] = [];
  for (const [key, config] of Object.entries(SEGMENT_METRIC_CONFIG)) {
    const stat = buildStat(
      key,
      config.label,
      config.direction,
      config.format,
      byMetric.get(key) ?? [],
    );
    if (stat) metrics.push(stat);
  }

  const estimatedDuration = buildStat(
    "duration_estimated",
    "Durée estimée",
    "max",
    (v) => `≈ ${Math.round(v)} min`,
    durationPoints,
  );

  const dates = realized.map((i) => i.date).sort();

  return {
    displayLabel,
    occurrences: realized.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    metrics,
    estimatedDuration,
  };
}

/** Résumé textuel court, calculé à 100% à partir des données réelles
 *  agrégées ci-dessus (aucun appel IA, aucune donnée inventée). Sert de
 *  contenu par défaut pour la section "Analyse" tant qu'aucune analyse
 *  IA dédiée aux segments course n'existe (voir SegmentAnalysisSheet). */
export function buildSegmentNarrative(stats: SegmentStats): string {
  if (stats.occurrences === 0) {
    return "Pas encore réalisé — les statistiques apparaîtront après ta première séance incluant ce segment.";
  }
  if (stats.occurrences === 1) {
    return `Réalisé 1 fois pour l'instant, le ${stats.firstDate}. Reviens ici après ta prochaine séance pour voir ta progression.`;
  }
  const trending = stats.metrics.find((m) => m.trend === "up" || m.trend === "down");
  const base = `Réalisé ${stats.occurrences} fois entre le ${stats.firstDate} et le ${stats.lastDate}.`;
  if (!trending || trending.progressionPct == null) return base;
  const pct = Math.abs(trending.progressionPct).toFixed(0);
  const sens = trending.trend === "up" ? "meilleure" : "moins bonne";
  return `${base} Ta ${trending.label.toLowerCase()} la plus récente est ${pct}% ${sens} que ta première.`;
}
