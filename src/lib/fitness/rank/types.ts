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

export interface ConfirmationRules {
  /** Nombre de derniers paliers (sur 30) nécessitant confirmation avant validation (ex 10 = Olympien+Primordial). */
  topTiersRequiringConfirmation: number;
  /** Nb de séances distinctes >= ce palier, parmi les plus récentes, requises pour confirmer. */
  sessionsRequired: number;
  /** Nb minimum de séances loguées sur l'exercice pour prétendre aux paliers du dessus. */
  minExperienceSessions: number;
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
