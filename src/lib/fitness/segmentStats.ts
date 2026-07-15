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
//
// CORRECTION 2026-07-11 (retour de Nathan) : l'unité d'analyse n'est pas
// la répétition individuelle mais l'EXERCICE réalisé au sein d'une
// séance — exactement le modèle séance > exercice > séries de la
// musculation (voir useExerciseSetHistory.ts, qui regroupe déjà les
// séries détaillées par séance). `computeSegmentStats` regroupe donc
// d'abord les répétitions réalisées PAR SÉANCE (même workout_id) avant de
// calculer meilleur/dernier/progression — une séance de fractionné avec
// 8 répétitions compte comme UNE réalisation, pas 8. `groupByExerciseLabel`
// (nouveau) fournit le même regroupement pour l'AFFICHAGE d'une liste de
// segments d'une séance (historique ou séance en cours), afin qu'une
// seule carte par exercice soit montrée avec ses répétitions groupées à
// l'intérieur — jamais une carte par répétition.
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
  /**
   * Identité métier stable (Phase 3, Étape 4) — présente uniquement pour les
   * sources capables de la fournir (`workout_segments.exercise_id`, voir
   * useSegmentHistory.ts). Absente (undefined) pour les sources qui n'ont
   * pas encore cette colonne (`workouts.metadata.segments`, voir
   * useDisciplineSegmentHistory.ts — limitation connue, non résolue à cette
   * étape). Champ additif, purement interne à la sélection par identité ;
   * n'est pas utilisé par `computeSegmentStats`/`groupByExerciseLabel`.
   */
  exerciseId?: string | null;
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
//
// PHASE 1 MULTI-DISCIPLINE (2026-07-11) : clés ajoutées pour Cardio/HYROX/
// Guided (voir SessionSegment.metrics, solution transitoire — ces
// disciplines n'écrivent pas dans workout_segments, leurs métriques
// viennent de workouts.metadata.segments via useDisciplineSegmentHistory).
// "distance_m" est délibérément PARTAGÉ avec Course/HYROX (SkiErg/Rameur/
// Running) : même grandeur, même unité, un seul vocabulaire — exactement
// l'esprit "un seul système d'exercices commun" demandé par Nathan.
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
  // ---- Cardio ----
  speed_kmh: {
    label: "Vitesse",
    direction: "max",
    format: (v) => `${v} km/h`,
  },
  incline_pct: {
    label: "Inclinaison",
    direction: "max",
    format: (v) => `${v} %`,
  },
  escalier_level: {
    label: "Niveau (escalier)",
    direction: "max",
    format: (v) => String(v),
  },
  resistance: {
    label: "Résistance",
    direction: "max",
    format: (v) => String(v),
  },
  cadence_rpm: {
    label: "Cadence",
    direction: "max",
    format: (v) => `${v} rpm`,
  },
  // ---- HYROX ----
  charge_kg: {
    label: "Charge",
    direction: "max",
    format: (v) => `${v} kg`,
  },
  reps: {
    label: "Répétitions",
    direction: "max",
    format: (v) => String(v),
  },
  rounds: {
    label: "Tours",
    direction: "max",
    format: (v) => String(v),
  },
  // ---- Guided ----
  duration_min: {
    label: "Durée",
    direction: "max",
    format: (v) => `${Math.round(v)} min`,
  },
  calories_estimate: {
    label: "Calories estimées",
    direction: "max",
    format: (v) => `~${Math.round(v)} kcal`,
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

export interface LabelGroup<T> {
  key: string;
  displayLabel: string;
  instances: T[];
}

/** Regroupe une liste de segments d'UNE séance (historique ou séance en
 *  cours) par type d'exercice (même identité que segmentTypeKey), en
 *  conservant l'ordre d'apparition du groupe (celui de la première
 *  occurrence) et l'ordre interne des répétitions. Générique sur T pour
 *  servir à la fois SessionSegment (historique, voir
 *  CourseHistoryContent.tsx) et ActiveGenericSegment (séance en cours,
 *  voir ActiveGenericSessionView.tsx / exerciseCard/ActiveExerciseCard.tsx (kind="generic")) sans
 *  dupliquer la logique de regroupement — une seule carte par exercice,
 *  jamais une par répétition (cf. en-tête de fichier, correction
 *  2026-07-11). */
export function groupByExerciseLabel<T extends { label: string }>(items: T[]): LabelGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const key = segmentTypeKey(item.label);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(item);
  }
  return order.map((key) => {
    const instances = byKey.get(key)!;
    return { key, displayLabel: segmentBaseLabel(instances[0].label), instances };
  });
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

/** Résumé d'UNE séance pour un type d'exercice donné : combien de
 *  répétitions, et la meilleure valeur par métrique connue au sein de
 *  CETTE séance uniquement (ex. l'allure la plus rapide des 8 répétitions
 *  de "400m" ce jour-là). Alimente la liste "Historique" de
 *  SegmentAnalysisSheet — un point par séance, jamais un point par
 *  répétition. */
export interface SegmentSessionSummary {
  workoutId: string;
  date: string;
  repCount: number;
  metrics: Record<string, number>;
}

export interface SegmentStats {
  displayLabel: string;
  /** Nombre de séances où cet exercice a été réalisé (pas le nombre de
   *  répétitions — une séance de fractionné à 8 répétitions compte pour 1). */
  sessionCount: number;
  /** Nombre total de répétitions réalisées, toutes séances confondues. */
  totalReps: number;
  firstDate: string | null;
  lastDate: string | null;
  metrics: MetricStat[];
  /** Durée estimée (distance réelle × allure réelle, sommée sur les
   *  répétitions d'une séance qui portent les deux métriques) — PAS un
   *  chrono mesuré. */
  estimatedDuration: MetricStat | null;
  /** Un point par séance (répétitions déjà agrégées) — source de la
   *  liste "Historique" affichée dans la fiche. */
  sessions: SegmentSessionSummary[];
}

/** Calcule les statistiques d'un type de segment (= exercice de course) à
 *  partir de toutes ses occurrences réelles, regroupées par séance
 *  (toutes séances Course terminées confondues). */
export function computeSegmentStats(
  displayLabel: string,
  instances: SegmentInstance[],
): SegmentStats {
  const realized = instances.filter((i) => i.completed);

  // 1) Regroupe les répétitions réalisées par séance (workout_id) : une
  // séance = une réalisation de l'exercice, quel que soit son nombre de
  // répétitions internes.
  const byWorkout = new Map<string, SegmentInstance[]>();
  for (const inst of realized) {
    if (!byWorkout.has(inst.workoutId)) byWorkout.set(inst.workoutId, []);
    byWorkout.get(inst.workoutId)!.push(inst);
  }

  const sessions: SegmentSessionSummary[] = [];
  const durationPoints: Array<{ date: string; value: number }> = [];
  for (const [workoutId, reps] of byWorkout) {
    const date = reps[0].date;
    const metrics: Record<string, number> = {};
    for (const [key, config] of Object.entries(SEGMENT_METRIC_CONFIG)) {
      const values = reps
        .map((r) => r.metrics[key])
        .filter((v): v is number => typeof v === "number");
      if (values.length === 0) continue;
      metrics[key] = config.direction === "min" ? Math.min(...values) : Math.max(...values);
    }
    sessions.push({ workoutId, date, repCount: reps.length, metrics });

    // Durée estimée de CETTE séance : somme, sur les répétitions qui
    // portent à la fois une distance et une allure réelles, de
    // distance/1000 * allure. Jamais de combinaison entre répétitions
    // différentes (pas de "meilleure distance" × "meilleure allure").
    let totalDuration = 0;
    let anyDuration = false;
    for (const r of reps) {
      const distance = r.metrics.distance_m;
      const pace = r.metrics.pace_min_per_km;
      if (typeof distance === "number" && typeof pace === "number") {
        totalDuration += (distance / 1000) * pace;
        anyDuration = true;
      }
    }
    if (anyDuration) durationPoints.push({ date, value: totalDuration });
  }
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  durationPoints.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // 2) Un point de progression par séance (pas par répétition) : le
  // meilleur/dernier/tendance reflètent l'exercice au fil des séances.
  const byMetric = new Map<string, Array<{ date: string; value: number }>>();
  for (const session of sessions) {
    for (const [key, value] of Object.entries(session.metrics)) {
      if (!byMetric.has(key)) byMetric.set(key, []);
      byMetric.get(key)!.push({ date: session.date, value });
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

  const totalReps = sessions.reduce((acc, s) => acc + s.repCount, 0);

  return {
    displayLabel,
    sessionCount: sessions.length,
    totalReps,
    firstDate: sessions[0]?.date ?? null,
    lastDate: sessions[sessions.length - 1]?.date ?? null,
    metrics,
    estimatedDuration,
    sessions,
  };
}

/** Résumé textuel court, calculé à 100% à partir des données réelles
 *  agrégées ci-dessus (aucun appel IA, aucune donnée inventée). Sert de
 *  contenu par défaut pour la section "Analyse" tant qu'aucune analyse
 *  IA dédiée aux segments course n'existe (voir SegmentAnalysisSheet). */
export function buildSegmentNarrative(stats: SegmentStats): string {
  if (stats.sessionCount === 0) {
    return "Pas encore réalisé — les statistiques apparaîtront après ta première séance incluant cet exercice.";
  }
  const repWord = (n: number) => `${n} répétition${n > 1 ? "s" : ""}`;
  if (stats.sessionCount === 1) {
    return `Réalisé 1 fois pour l'instant (${repWord(stats.totalReps)}), le ${stats.firstDate}. Reviens ici après ta prochaine séance pour voir ta progression.`;
  }
  const trending = stats.metrics.find((m) => m.trend === "up" || m.trend === "down");
  const base = `Réalisé ${stats.sessionCount} fois (${repWord(stats.totalReps)} au total) entre le ${stats.firstDate} et le ${stats.lastDate}.`;
  if (!trending || trending.progressionPct == null) return base;
  const pct = Math.abs(trending.progressionPct).toFixed(0);
  const sens = trending.trend === "up" ? "meilleure" : "moins bonne";
  return `${base} Ta ${trending.label.toLowerCase()} la plus récente est ${pct}% ${sens} que ta première.`;
}
