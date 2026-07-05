// ============================================================
// Moteur de calcul Rang / Maîtrise (domaine pur, zéro React).
//
// Deux notions séparées :
// - Rang        : niveau réel actuel, absolu, jamais comparé aux
//                 autres utilisateurs. Peut être atteint dès la
//                 première séance enregistrée.
// - Maîtrise    : consolidation de ce rang + progression vers le
//                 suivant (barre affichée sous le rang).
//
// Aucune pondération ni aucun seuil n'est codé en dur ici : tout
// vient du RankEngineConfig (voir config.ts), pour pouvoir ajuster
// l'importance du 1RM, du volume, de la régularité, etc. sans
// toucher à cet algorithme.
// ============================================================

import { estimate1RM } from "../strength";
import { classifyExerciseFamily } from "./familyClassification";
import type {
  ExerciseFamily,
  FamilyStandard,
  RankEngineConfig,
  RankResult,
  SessionInput,
  SessionMetrics,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY;
}

// ── Métriques de séance ──────────────────────────────────────

export function computeSessionMetrics(s: SessionInput): SessionMetrics {
  let tonnage = 0;
  let topWeight = 0;
  let topReps = 0;
  let best1RM = 0;
  let count = 0;
  for (const set of s.sets) {
    const reps = set.reps ?? 0;
    if (reps <= 0) continue;
    count += 1;
    const weight = set.weight ?? 0;
    const w = weight > 0 ? weight : 1; // poids du corps : tonnage = reps
    tonnage += reps * w;
    if (weight > topWeight) {
      topWeight = weight;
      topReps = reps;
    } else if (weight === topWeight && reps > topReps) {
      topReps = reps;
    }
    const orm = estimate1RM(w, reps) ?? 0;
    if (orm > best1RM) best1RM = orm;
  }
  return { date: s.date, tonnage, topWeight, topReps, best1RM, setCount: count };
}

// ── Ratio / reps selon la famille ────────────────────────────

function ratioOrRepsForFamily(
  family: ExerciseFamily,
  standard: FamilyStandard,
  metrics: SessionMetrics,
  bodyweightKg: number,
): number {
  if (standard.unit === "reps") {
    // Poids ajouté converti en répétitions équivalentes (~1 rep / 5% du PC).
    const addedWeight = Math.max(0, metrics.topWeight);
    const bonusReps = bodyweightKg > 0 ? addedWeight / (0.05 * bodyweightKg) : 0;
    return metrics.topReps + bonusReps;
  }
  if (bodyweightKg <= 0) return 0;
  return metrics.best1RM / bodyweightKg;
}

// ── Position continue sur l'échelle des 30 paliers ───────────

function interpolateTierPosition(value: number, boundaries: [number, number, number, number, number]): number {
  const extended = [0, ...boundaries, boundaries[4] + (boundaries[4] - boundaries[3])];
  for (let i = 0; i < 6; i++) {
    if (value <= extended[i + 1] || i === 5) {
      const span = extended[i + 1] - extended[i];
      const frac = span > 0 ? clamp((value - extended[i]) / span, 0, 1) : 0;
      return Math.min(29.999, i * 5 + frac * 5);
    }
  }
  return 0;
}

// ── Score de niveau d'une séance (position brute 0..30) ──────
// relativeStrength pilote la position ; volume et repQuality n'agissent
// que comme modificateurs bornés (faute de barèmes de volume/qualité
// calibrés par famille pour l'instant — cf. proposition).

function computeRankScorePosition(
  config: RankEngineConfig,
  family: ExerciseFamily,
  standard: FamilyStandard,
  metrics: SessionMetrics,
  bodyweightKg: number,
): number {
  const raw = ratioOrRepsForFamily(family, standard, metrics, bodyweightKg);
  const strengthPos = interpolateTierPosition(raw, standard.boundaries);

  // Volume attendu proportionnel au NOMBRE DE SÉRIES réellement loguées :
  // une séance à une seule série (typiquement la toute première fois qu'on
  // enregistre l'exercice) est neutre, ni bonus ni pénalité. Le modificateur
  // ne joue que si les séries suivantes s'écartent nettement de la série
  // de référence (beaucoup mieux ou beaucoup moins bien remplies).
  const referenceLoad = metrics.topWeight > 0 ? metrics.topWeight : 1;
  const expectedTonnage = referenceLoad * metrics.topReps * Math.max(1, metrics.setCount);
  const volumeRatio = expectedTonnage > 0 ? clamp(metrics.tonnage / expectedTonnage, 0, 1.5) : 1;
  const volumeModifier = (volumeRatio - 1) * 2; // ~ -2..+1 palier

  const repQualityModifier = metrics.topReps >= 5 ? 0.3 : metrics.topReps <= 2 ? -0.3 : 0;

  // strengthPos reste l'ancre (jamais diluée) ; volume et repQuality ne font
  // que la déplacer de +/- quelques paliers, proportionnellement à leur poids
  // relatif à relativeStrength (plus ce dernier est pondéré fort, moins les
  // modificateurs pèsent — et inversement).
  const w = config.rankScoreWeights;
  const weightSum = w.relativeStrength + w.volume + w.repQuality || 1;
  const modifierContribution =
    (w.volume * volumeModifier * 5 + w.repQuality * repQualityModifier * 5) / weightSum;

  return clamp(strengthPos + modifierContribution, 0, 30);
}

// ── Composantes de Maîtrise (0..1 chacune) ───────────────────

function trend(values: number[]): number {
  if (values.length < 2) return 0;
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const a = avg(first);
  const b = avg(second);
  if (a <= 0) return b > 0 ? 1 : 0;
  return clamp((b - a) / a / 0.15, 0, 1); // +15% sur la fenêtre = trend max
}

function computeMasteryPercent(
  config: RankEngineConfig,
  family: ExerciseFamily,
  metricsWindow: SessionMetrics[],
  totalSessions: number,
  overshoot: number,
  now: Date,
): number {
  if (metricsWindow.length === 0) return 0;

  const overload = trend(metricsWindow.map((m) => m.best1RM));
  const repsTrend = trend(metricsWindow.map((m) => m.topReps));
  const tonnageTrend = trend(metricsWindow.map((m) => m.tonnage));

  const last28 = metricsWindow.filter((m) => daysBetween(now, new Date(m.date)) <= 28).length;
  const expectedPer28 = config.expectedWeeklyFrequency[family] * 4;
  const frequency = expectedPer28 > 0 ? clamp(last28 / expectedPer28, 0, 1) : 0;

  const dates = metricsWindow.map((m) => new Date(m.date).getTime()).sort((a, b) => a - b);
  const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / MS_PER_DAY);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const variance = gaps.length
    ? gaps.reduce((a, g) => a + (g - avgGap) ** 2, 0) / gaps.length
    : 0;
  const consistency = avgGap > 0 ? clamp(1 - Math.sqrt(variance) / avgGap, 0, 1) : 0;

  const bestEver = Math.max(...metricsWindow.map((m) => m.best1RM), 0);
  const lastMetric = metricsWindow[metricsWindow.length - 1];
  const daysSincePR = daysBetween(now, new Date(lastMetric.date));
  const recentPR = lastMetric.best1RM >= bestEver && daysSincePR <= 21 ? 1 : 0;

  const experience = clamp(totalSessions / config.experienceCapSessions, 0, 1);

  const w = config.masteryWeights;
  const weightSum =
    w.overload + w.reps + w.tonnageTrend + w.frequency + w.consistency + w.recentPR + w.experience;
  const momentum =
    (overload * w.overload +
      repsTrend * w.reps +
      tonnageTrend * w.tonnageTrend +
      frequency * w.frequency +
      consistency * w.consistency +
      recentPR * w.recentPR +
      experience * w.experience) /
    (weightSum || 1);

  return Math.round(100 * clamp(0.65 * overshoot + 0.35 * momentum, 0, 1));
}

// ── Point d'entrée ────────────────────────────────────────────

export function computeRankState(
  config: RankEngineConfig,
  exerciseName: string,
  sessions: SessionInput[],
  bodyweightKg: number,
  now: Date = new Date(),
): RankResult {
  const family = classifyExerciseFamily(exerciseName);
  const standard = config.familyStandards[family];
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const allMetrics = sorted.map(computeSessionMetrics).filter((m) => m.setCount > 0);

  if (allMetrics.length === 0) {
    return {
      family,
      rawRatioOrReps: 0,
      rawTierPosition: 0,
      confirmedTierIndex: 0,
      masteryPercent: 0,
      nextRankHint: "Enregistre ta première série pour démarrer.",
      sessionsConsidered: 0,
      daysSinceLastSession: null,
    };
  }

  const windowMetrics = allMetrics.slice(-config.consolidationWindowSessions);
  const positions = windowMetrics.map((m) =>
    computeRankScorePosition(config, family, standard, m, bodyweightKg),
  );
  const bestIdx = positions.indexOf(Math.max(...positions));
  const rawTierPosition = positions[bestIdx];
  const rawRatioOrReps = ratioOrRepsForFamily(family, standard, windowMetrics[bestIdx], bodyweightKg);

  let confirmedTierIndex = Math.floor(rawTierPosition);

  // Confirmation en cascade, Primordial d'abord (la plus stricte) puis
  // Olympien : chaque gate exige plusieurs séances qualifiantes ÉTALÉES sur
  // une durée minimale (minSpanDays), pas seulement un cluster récent — ce
  // sont les deux seuls rangs qui doivent représenter une vraie référence
  // dans le temps, pas juste un excellent niveau instantané. En dessous de
  // la plus basse gate, une seule séance suffit à être crédité pleinement.
  const gatesDesc = [...config.confirmation.gates].sort((a, b) => b.fromTierIndex - a.fromTierIndex);
  for (const gate of gatesDesc) {
    if (confirmedTierIndex < gate.fromTierIndex) continue;
    const lookback = allMetrics.slice(-gate.lookbackSessions);
    const qualifying = lookback.filter(
      (m) => computeRankScorePosition(config, family, standard, m, bodyweightKg) >= gate.fromTierIndex,
    );
    const span =
      qualifying.length >= 2
        ? daysBetween(new Date(qualifying[0].date), new Date(qualifying[qualifying.length - 1].date))
        : 0;
    const hasExperience = allMetrics.length >= gate.minExperienceSessions;
    const satisfied = qualifying.length >= gate.sessionsRequired && span >= gate.minSpanDays && hasExperience;
    if (!satisfied) {
      confirmedTierIndex = Math.min(confirmedTierIndex, gate.fromTierIndex - 1);
    }
  }

  const lastDate = new Date(allMetrics[allMetrics.length - 1].date);
  const daysSinceLastSession = daysBetween(now, lastDate);

  // Seul et unique mécanisme de décroissance temporelle : jamais plus d'un
  // palier, quelle que soit la durée d'inactivité.
  if (daysSinceLastSession > config.inactivity.rankDecayStartDays) {
    confirmedTierIndex = Math.max(0, confirmedTierIndex - config.inactivity.maxRankDropPerEvent);
  }

  const overshoot = clamp(rawTierPosition - confirmedTierIndex, 0, 1);
  const masteryPercent = computeMasteryPercent(
    config,
    family,
    windowMetrics,
    allMetrics.length,
    overshoot,
    now,
  );

  let nextRankHint: string | null = null;
  if (confirmedTierIndex < 29) {
    if (overshoot >= 0.5) {
      nextRankHint = "1 à 2 performances similaires suffiront pour passer au rang suivant.";
    } else {
      const last = windowMetrics[windowMetrics.length - 1];
      if (last.topWeight > 0) {
        nextRankHint = `+2,5 kg ou +2 reps à ${last.topWeight} kg pour progresser.`;
      } else {
        nextRankHint = `+${Math.max(2, Math.round(last.topReps * 0.15))} répétitions pour progresser.`;
      }
    }
  }

  return {
    family,
    rawRatioOrReps,
    rawTierPosition,
    confirmedTierIndex,
    masteryPercent,
    nextRankHint,
    sessionsConsidered: allMetrics.length,
    daysSinceLastSession,
  };
}
