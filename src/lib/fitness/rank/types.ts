// ============================================================
// Moteur de Rang / Maîtrise — types partagés.
// Toute pondération et tout seuil vit dans un RankEngineConfig
// (voir config.ts) : aucun nombre codé en dur dans engine.ts.
// ============================================================

export type ExerciseFamily =
  | "squat_presse_jambes"
  | "deadlift_tirage_hanche"
  | "developpe_couche"
  | "developpe_militaire"
  | "tirage_traction_dos"
  | "isolation"
  | "poids_de_corps";

export interface RatioFamilyStandard {
  unit: "ratio";
  /** Ratio 1RM estimé / poids de corps marquant le DÉBUT de Guerrier, Héros, Titan, Olympien, Primordial. */
  boundaries: [number, number, number, number, number];
}

export interface RepsFamilyStandard {
  unit: "reps";
  /** Répétitions strictes à poids de corps marquant le DÉBUT de chaque rang au-delà de Mortel. */
  boundaries: [number, number, number, number, number];
}

export type FamilyStandard = RatioFamilyStandard | RepsFamilyStandard;

export interface SessionSetInput {
  reps: number | null;
  weight: number | null;
}

export interface SessionInput {
  workoutId: string;
  date: string; // YYYY-MM-DD
  sets: SessionSetInput[];
}

export interface RankScoreWeights {
  relativeStrength: number;
  volume: number;
  repQuality: number;
}

export interface MasteryWeights {
  overload: number;
  reps: number;
  tonnageTrend: number;
  frequency: number;
  consistency: number;
  recentPR: number;
  experience: number;
}

/**
 * Un palier de confirmation : pour prétendre à un tierIndex >= fromTierIndex,
 * il faut réunir plusieurs performances qualifiantes ÉTALÉES DANS LE TEMPS,
 * pas seulement un pic récent. Olympien et Primordial ont chacun leur propre
 * gate, Primordial nettement plus exigeant — ce sont les deux seuls rangs
 * qui doivent représenter une vraie référence, pas juste un bon niveau.
 */
export interface ConfirmationGate {
  /** Tier (0..29) à partir duquel cette gate s'applique. */
  fromTierIndex: number;
  /** Nb de séances qualifiantes (>= fromTierIndex) requises. */
  sessionsRequired: number;
  /** Écart minimum (jours) entre la 1ère et la dernière séance qualifiante. */
  minSpanDays: number;
  /** Nb minimum de séances loguées sur l'exercice, toutes confondues. */
  minExperienceSessions: number;
  /** Nb de séances récentes (par date) parmi lesquelles chercher les qualifiantes. */
  lookbackSessions: number;
}

export interface ConfirmationRules {
  /** Triées par fromTierIndex décroissant (Primordial avant Olympien). */
  gates: ConfirmationGate[];
}

export interface InactivityDecay {
  masteryDecayStartDays: number;
  rankDecayStartDays: number;
  maxRankDropPerEvent: number;
}

export interface RankEngineConfig {
  rankScoreWeights: RankScoreWeights;
  masteryWeights: MasteryWeights;
  confirmation: ConfirmationRules;
  inactivity: InactivityDecay;
  consolidationWindowSessions: number;
  expectedWeeklyFrequency: Record<ExerciseFamily, number>;
  experienceCapSessions: number;
  familyStandards: Record<ExerciseFamily, FamilyStandard>;
}

export interface SessionMetrics {
  date: string;
  tonnage: number;
  topWeight: number;
  topReps: number;
  best1RM: number;
  setCount: number;
}

export interface RankResult {
  family: ExerciseFamily;
  rawRatioOrReps: number;
  rawTierPosition: number; // continu, 0..30 : plafond potentiel instantané
  confirmedTierIndex: number; // entier, 0..29 : ce qui est réellement affiché
  masteryPercent: number; // 0..100, affiché "Maîtrise : X %"
  nextRankHint: string | null;
  sessionsConsidered: number;
  daysSinceLastSession: number | null;
}
