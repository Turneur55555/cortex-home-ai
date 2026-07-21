// ============================================================
// Copie fidèle du moteur de Rang par exercice, pour l'Edge Function
// `verify-exercise-rank`.
//
// ⚠️ SOURCE DE VÉRITÉ VISUELLE/CLIENTE : `src/lib/fitness/rank/engine.ts` +
// `config.ts` + `familyClassification.ts` + `src/lib/fitness/exerciseRanks.ts`
// (RANK_TIERS/LEVELS_PER_RANK) + `src/lib/fitness/strength.ts` (estimate1RM).
// Ce fichier est une copie DÉLIBÉRÉE (pas un import — les Edge Functions Deno
// ne peuvent pas résoudre les alias `@/` ni sortir de `supabase/functions/`)
// destinée à donner au SERVEUR la même autorité de calcul que le client, sans
// jamais faire confiance à une valeur envoyée par le client.
//
// Toute modification de la logique de Rang côté client (poids/seuils/
// gates de confirmation/décroissance) DOIT être répercutée ici. Un test de
// parité existe côté client (`src/lib/fitness/rank/rankEngine.sql-parity.test.ts`)
// qui compare ce fichier au moteur réel sur un large échantillon — il échoue
// si les deux divergent.
// ============================================================

export type RankKey = "mortel" | "guerrier" | "heros" | "titan" | "olympien" | "primordial";

export const RANK_KEYS: RankKey[] = ["mortel", "guerrier", "heros", "titan", "olympien", "primordial"];
export const LEVELS_PER_RANK = 5;
export const TOTAL_TIERS = RANK_KEYS.length * LEVELS_PER_RANK; // 30

export type ExerciseFamily =
  | "squat_presse_jambes"
  | "deadlift_tirage_hanche"
  | "developpe_couche"
  | "developpe_militaire"
  | "tirage_traction_dos"
  | "isolation"
  | "poids_de_corps";

interface RatioFamilyStandard {
  unit: "ratio";
  boundaries: [number, number, number, number, number];
}
interface RepsFamilyStandard {
  unit: "reps";
  boundaries: [number, number, number, number, number];
}
type FamilyStandard = RatioFamilyStandard | RepsFamilyStandard;

interface RankScoreWeights {
  relativeStrength: number;
  volume: number;
  repQuality: number;
}
interface ConfirmationGate {
  fromTierIndex: number;
  sessionsRequired: number;
  minSpanDays: number;
  minExperienceSessions: number;
  lookbackSessions: number;
}
interface RankEngineConfig {
  rankScoreWeights: RankScoreWeights;
  confirmation: { gates: ConfirmationGate[] };
  inactivity: { rankDecayStartDays: number; maxRankDropPerEvent: number };
  consolidationWindowSessions: number;
  familyStandards: Record<ExerciseFamily, FamilyStandard>;
}

// ── Miroir exact de rank/config.ts (DEFAULT_RANK_ENGINE_CONFIG) ────────
export const DEFAULT_RANK_ENGINE_CONFIG: RankEngineConfig = {
  rankScoreWeights: { relativeStrength: 0.7, volume: 0.15, repQuality: 0.15 },
  confirmation: {
    gates: [
      { fromTierIndex: 25, sessionsRequired: 5, minSpanDays: 60, minExperienceSessions: 15, lookbackSessions: 20 },
      { fromTierIndex: 20, sessionsRequired: 3, minSpanDays: 30, minExperienceSessions: 10, lookbackSessions: 15 },
    ],
  },
  inactivity: { rankDecayStartDays: 75, maxRankDropPerEvent: 1 },
  consolidationWindowSessions: 8,
  familyStandards: {
    squat_presse_jambes: { unit: "ratio", boundaries: [0.5, 0.9, 1.3, 1.7, 2.1] },
    deadlift_tirage_hanche: { unit: "ratio", boundaries: [0.6, 1.0, 1.4, 1.8, 2.3] },
    developpe_couche: { unit: "ratio", boundaries: [0.35, 0.6, 0.85, 1.1, 1.4] },
    developpe_militaire: { unit: "ratio", boundaries: [0.25, 0.4, 0.6, 0.8, 1.0] },
    tirage_traction_dos: { unit: "ratio", boundaries: [0.4, 0.6, 0.85, 1.1, 1.4] },
    isolation: { unit: "ratio", boundaries: [0.15, 0.3, 0.45, 0.6, 0.8] },
    poids_de_corps: { unit: "reps", boundaries: [3, 7, 12, 18, 25] },
  },
};

// ── Miroir exact de exerciseCatalog.ts (normalize) ──────────────────────
export function normalize(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── Miroir exact de rank/familyClassification.ts ────────────────────────
interface FamilyRule {
  pattern: RegExp;
  family: ExerciseFamily;
}
const FAMILY_RULES: FamilyRule[] = [
  {
    pattern: /\bsquat\b|hack squat|front squat|goblet|presse.?(a|à).?cuisses|leg press|fentes?|lunge/,
    family: "squat_presse_jambes",
  },
  { pattern: /soulev(e|é) de terre|deadlift/, family: "deadlift_tirage_hanche" },
  {
    pattern: /d(e|é)velopp(e|é) couch(e|é)|bench press|pompes?|push.?up|chest press/,
    family: "developpe_couche",
  },
  {
    pattern: /d(e|é)velopp(e|é) militaire|overhead press|d(e|é)velopp(e|é) nuque|d(e|é)velopp(e|é) (e|é)paules?/,
    family: "developpe_militaire",
  },
  { pattern: /traction|pull ?up|chin ?up|\bdips?\b/, family: "poids_de_corps" },
  { pattern: /tirage|rowing|\brow\b/, family: "tirage_traction_dos" },
  {
    pattern:
      /curl|extension|(e|é)cart(e|é)|(e|é)l(e|é)vation|kickback|pull ?over|shrug|crunch|leg raise|mollets?|\bcalf\b/,
    family: "isolation",
  },
];
export function classifyExerciseFamily(name: string): ExerciseFamily {
  const n = normalize(name);
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(n)) return rule.family;
  }
  return "isolation";
}

// ── Miroir exact de strength.ts (estimate1RM, Epley) ────────────────────
export function estimate1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (weight == null || reps == null) return null;
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weight * 10) / 10;
  const oneRm = weight * (1 + reps / 30);
  return Math.round(oneRm * 10) / 10;
}

// ── Miroir exact de rank/engine.ts ──────────────────────────────────────
export interface SessionSetInput {
  reps: number | null;
  weight: number | null;
}
export interface SessionInput {
  workoutId: string;
  date: string;
  sets: SessionSetInput[];
}
interface SessionMetrics {
  date: string;
  tonnage: number;
  topWeight: number;
  topReps: number;
  best1RM: number;
  setCount: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY;
}

function computeSessionMetrics(s: SessionInput): SessionMetrics {
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
    const w = weight > 0 ? weight : 1;
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

function ratioOrRepsForFamily(
  family: ExerciseFamily,
  standard: FamilyStandard,
  metrics: SessionMetrics,
  bodyweightKg: number,
): number {
  if (standard.unit === "reps") {
    const addedWeight = Math.max(0, metrics.topWeight);
    const bonusReps = bodyweightKg > 0 ? addedWeight / (0.05 * bodyweightKg) : 0;
    return metrics.topReps + bonusReps;
  }
  if (bodyweightKg <= 0) return 0;
  return metrics.best1RM / bodyweightKg;
}

function interpolateTierPosition(
  value: number,
  boundaries: [number, number, number, number, number],
): number {
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

function computeRankScorePosition(
  config: RankEngineConfig,
  family: ExerciseFamily,
  standard: FamilyStandard,
  metrics: SessionMetrics,
  bodyweightKg: number,
): number {
  const raw = ratioOrRepsForFamily(family, standard, metrics, bodyweightKg);
  const strengthPos = interpolateTierPosition(raw, standard.boundaries);

  const referenceLoad = metrics.topWeight > 0 ? metrics.topWeight : 1;
  const expectedTonnage = referenceLoad * metrics.topReps * Math.max(1, metrics.setCount);
  const volumeRatio = expectedTonnage > 0 ? clamp(metrics.tonnage / expectedTonnage, 0, 1.5) : 1;
  const volumeModifier = (volumeRatio - 1) * 2;

  const repQualityModifier = metrics.topReps >= 5 ? 0.3 : metrics.topReps <= 2 ? -0.3 : 0;

  const w = config.rankScoreWeights;
  const weightSum = w.relativeStrength + w.volume + w.repQuality || 1;
  const modifierContribution =
    (w.volume * volumeModifier * 5 + w.repQuality * repQualityModifier * 5) / weightSum;

  return clamp(strengthPos + modifierContribution, 0, 30);
}

export interface RankResult {
  family: ExerciseFamily;
  confirmedTierIndex: number;
  sessionsConsidered: number;
}

/** Recalcule le Rang confirmé (0..29) entièrement depuis les données brutes. */
export function computeConfirmedTier(
  exerciseName: string,
  sessions: SessionInput[],
  bodyweightKg: number,
  now: Date = new Date(),
): RankResult {
  const config = DEFAULT_RANK_ENGINE_CONFIG;
  const family = classifyExerciseFamily(exerciseName);
  const standard = config.familyStandards[family];
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const allMetrics = sorted.map(computeSessionMetrics).filter((m) => m.setCount > 0);

  if (allMetrics.length === 0) {
    return { family, confirmedTierIndex: 0, sessionsConsidered: 0 };
  }

  const windowMetrics = allMetrics.slice(-config.consolidationWindowSessions);
  const positions = windowMetrics.map((m) =>
    computeRankScorePosition(config, family, standard, m, bodyweightKg),
  );
  const bestIdx = positions.indexOf(Math.max(...positions));
  const rawTierPosition = positions[bestIdx];

  let confirmedTierIndex = Math.floor(rawTierPosition);

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
    const satisfied =
      qualifying.length >= gate.sessionsRequired && span >= gate.minSpanDays && hasExperience;
    if (!satisfied) {
      confirmedTierIndex = Math.min(confirmedTierIndex, gate.fromTierIndex - 1);
    }
  }

  const lastDate = new Date(allMetrics[allMetrics.length - 1].date);
  const daysSinceLastSession = daysBetween(now, lastDate);
  if (daysSinceLastSession > config.inactivity.rankDecayStartDays) {
    confirmedTierIndex = Math.max(0, confirmedTierIndex - config.inactivity.maxRankDropPerEvent);
  }

  return { family, confirmedTierIndex, sessionsConsidered: allMetrics.length };
}
