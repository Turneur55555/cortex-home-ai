// ============================================================
// Moteur d'analyse par exercice — types du domaine (zéro React).
//
// Ce moteur agrège les signaux déjà produits par le reste du domaine
// fitness (rangs RPG, XP, progression, récupération, mensurations) en une
// « fiche d'analyse » unique, déterministe et extensible. Aucun appel réseau,
// aucune couleur, aucune dépendance UI : uniquement de la logique pure.
// ============================================================

import type { MuscleId } from "../muscleMapping";
import type { RecoveryStatus } from "../recovery";

/** Objectif d'entraînement de l'utilisateur (inféré ou choisi explicitement). */
export type TrainingObjective =
  | "force"
  | "hypertrophie"
  | "seche"
  | "endurance"
  | "posture"
  | "general";

export const OBJECTIVE_LABELS: Record<TrainingObjective, string> = {
  force: "Force",
  hypertrophie: "Hypertrophie",
  seche: "Sèche",
  endurance: "Endurance",
  posture: "Posture & santé",
  general: "Forme générale",
};

/** Rôle d'un muscle dans un mouvement. */
export type MuscleRole = "primary" | "secondary" | "stabilizer";

export const ROLE_LABELS: Record<MuscleRole, string> = {
  primary: "Principal",
  secondary: "Secondaire",
  stabilizer: "Stabilisateur",
};

/** Aspects physiques développés par un exercice. */
export type PhysicalTrait =
  | "largeur"
  | "epaisseur"
  | "force"
  | "hypertrophie"
  | "explosivite"
  | "stabilite"
  | "posture"
  | "mobilite";

export const TRAIT_LABELS: Record<PhysicalTrait, string> = {
  largeur: "Largeur",
  epaisseur: "Épaisseur",
  force: "Force",
  hypertrophie: "Hypertrophie",
  explosivite: "Explosivité",
  stabilite: "Stabilité",
  posture: "Posture",
  mobilite: "Mobilité",
};

/** Tendance d'une métrique entre les dernières séances. */
export type Trend = "up" | "down" | "flat" | "none";

/** État global de la progression de l'exercice. */
export type ProgressState = "progression" | "stagnation" | "regression" | "nouveau";

// ── Décomposition musculaire ────────────────────────────────────────────────

export interface MuscleContribution {
  id: MuscleId;
  label: string;
  role: MuscleRole;
  /** 0..100 — intensité de sollicitation pour CET exercice. */
  solicitation: number;
  /** État de récupération courant (issu du module Corps / recovery map). */
  recovery: RecoveryStatus;
  /** Heures restantes avant récupération complète (null si inconnu). */
  hoursRemaining: number | null;
}

// ── Impact physique ─────────────────────────────────────────────────────────

export interface TraitImpact {
  trait: PhysicalTrait;
  label: string;
  /** 0..100 — pondéré par le profil utilisateur. */
  score: number;
}

// ── Comparaison temporelle ──────────────────────────────────────────────────

export interface MetricComparison {
  key: "charge" | "reps" | "volume" | "1rm";
  label: string;
  current: number | null;
  previous: number | null;
  /** Variation en % (null si non calculable). */
  deltaPct: number | null;
  trend: Trend;
}

export interface ComparisonReport {
  state: ProgressState;
  metrics: MetricComparison[];
  /** Records battus lors de la dernière séance. */
  prsBroken: string[];
  /** Explication systématique du « pourquoi ». */
  explanation: string;
}

// ── Recommandations ─────────────────────────────────────────────────────────

export type RecommendationType =
  | "augmenter_charge"
  | "augmenter_reps"
  | "ajouter_serie"
  | "modifier_amplitude"
  | "ralentir_excentrique"
  | "ameliorer_technique"
  | "augmenter_frequence"
  | "recuperer";

export interface Recommendation {
  type: RecommendationType;
  /** Priorité 1 (haute) → 3 (basse), pour le tri. */
  priority: 1 | 2 | 3;
  text: string;
  /** Pourquoi cette recommandation, à partir des données réelles. */
  rationale: string;
}

// ── Déséquilibres ───────────────────────────────────────────────────────────

export type ImbalanceType =
  | "muscle_neglige"
  | "chaine_sous_volume"
  | "progression_insuffisante"
  | "recuperation_incomplete"
  | "push_pull"
  | "haut_bas";

export type Severity = "info" | "warning" | "alert";

export interface Imbalance {
  type: ImbalanceType;
  severity: Severity;
  text: string;
  recommendation: string;
}

// ── Score de pertinence ─────────────────────────────────────────────────────

export type RelevanceLabel = "essentiel" | "recommande" | "secondaire" | "peu_pertinent";

export const RELEVANCE_LABELS: Record<RelevanceLabel, string> = {
  essentiel: "Essentiel",
  recommande: "Recommandé",
  secondaire: "Secondaire",
  peu_pertinent: "Peu pertinent",
};

export interface RelevanceScore {
  /** Entier 1..5 (nombre d'étoiles pleines). */
  stars: number;
  label: RelevanceLabel;
  reasons: string[];
}

// ── Fiche d'analyse complète ────────────────────────────────────────────────

export interface ExerciseAnalysis {
  exerciseName: string;
  /** true = aucun mapping spécifique trouvé, modèle biomécanique générique. */
  isGenericModel: boolean;
  objective: TrainingObjective;
  muscles: MuscleContribution[];
  physicalImpact: TraitImpact[];
  comparison: ComparisonReport;
  recommendations: Recommendation[];
  imbalances: Imbalance[];
  relevance: RelevanceScore;
  /** Analyse rédigée en langage naturel (déterministe). */
  narrative: string;
  /** Résumé intelligent : ce que cette séance apporte réellement. */
  smartSummary: string;
}
