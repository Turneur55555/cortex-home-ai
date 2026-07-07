// ============================================================
// FONDATION — Architecture à moteurs du module Séances ("La Forge").
//
// Ce fichier est le contrat DÉFINITIF entre :
//   - le Sensei^IA (dialogue conversationnel, phase 2)
//   - les moteurs de discipline (StrengthWorkoutEngine, puis
//     HyroxWorkoutEngine, RunningWorkoutEngine, CardioWorkoutEngine,
//     GuidedActivityEngine, et toute discipline future : Natation,
//     Escalade, Arts martiaux, CrossFit, Spartan Race...)
//   - la persistance Supabase (workouts + exercises/exercise_sets)
//   - l'historique (phase 7)
//
// Règle d'or (Open/Closed) : ajouter une discipline = créer UN
// nouveau fichier qui implémente `WorkoutEngine` + une ligne dans
// `registry.ts`. Jamais modifier un moteur existant, jamais ajouter
// de if/switch(discipline) dans l'UI, le Sensei ou l'historique —
// ils ne dialoguent qu'avec cette interface.
//
// Frontière avec le moteur de Rang/Maîtrise/Badges : ces moteurs
// n'existent QUE pour la musculation et n'interprètent que des
// séries {reps, weight}. `feedsRankEngine` matérialise cette
// frontière : seule StrengthWorkoutEngine (id: "muscu") vaut true.
// Aucune discipline future ne doit écrire dans `exercises` /
// `exercise_sets` — tout son contenu structuré vit dans
// `workouts.metadata` (jsonb, additif, jamais lu par le Rang).
// ============================================================

/** Identifiants stables des disciplines. Étendre cette union = seule
 *  modification nécessaire ici pour préparer une discipline future. */
export type DisciplineId = "muscu" | "hyrox" | "course" | "cardio" | "guided";

// ---- Dialogue Sensei (contrat posé en phase 1, consommé en phase 2) ----

export type SenseiAnswerValue = string | number | boolean | string[] | undefined;

/** Sac de réponses génériques accumulées par l'orchestrateur Sensei.
 *  L'orchestrateur ne connaît JAMAIS la signification des clés :
 *  seul le moteur de la discipline choisie sait les interpréter. */
export type SenseiAnswers = Record<string, SenseiAnswerValue>;

/** Contexte calculé par l'app (PAS une réponse de l'utilisateur) : données
 *  déjà connues qu'on ne redemande pas dans le dialogue (récupération
 *  musculaire, profil, historique récent...). Opaque pour l'orchestrateur,
 *  interprété uniquement par le moteur qui le reçoit. */
export type SenseiContext = Record<string, unknown>;

export interface SenseiQuestionOption {
  value: string;
  label: string;
}

export interface SenseiQuestionSpec {
  /** Clé dans SenseiAnswers. */
  id: string;
  prompt: string;
  type: "single-choice" | "multi-choice" | "number" | "text" | "location";
  options?: SenseiQuestionOption[];
  defaultValue?: SenseiAnswerValue;
  /** Affichage conditionnel selon les réponses déjà données (ex: pas de
   *  question "matériel" pour une discipline qui n'en a pas besoin). */
  when?: (answers: SenseiAnswers) => boolean;
}

// ---- Résultat de génération ----

export interface WorkoutTemplateExercise {
  name: string;
  sets: string;
  reps: string;
  weight: string;
  image_path: string | null;
}

/** Forme historique (musculation) du résultat d'une génération.
 *  Conservée telle quelle pour la rétrocompatibilité avec WorkoutSheet
 *  et SeancesTab, qui l'attendent déjà. Les disciplines non-musculation
 *  ne sont PAS obligées de produire des "exercises" au sens strict —
 *  voir `toWorkoutRecord` pour la vraie frontière de persistance. */
export interface WorkoutTemplate {
  name: string;
  exercises: WorkoutTemplateExercise[];
  notes?: string;
}

// ---- Persistance générique (frontière avec Supabase) ----

/** Brouillon générique prêt à être enregistré. Toute discipline produit
 *  une ligne `workouts` (name, duration, notes, gym_location, discipline,
 *  metadata). `exerciseRows` est RÉSERVÉ aux disciplines feedsRankEngine
 *  (aujourd'hui : muscu uniquement) — tout le reste passe par `metadata`. */
export interface WorkoutRecordDraft {
  discipline: DisciplineId;
  name: string;
  duration_minutes: number;
  notes?: string;
  gym_location?: string;
  /** Données structurées propres à la discipline (distance, allure, blocs
   *  HYROX, zones FC...). Jamais lu par le moteur de Rang/Badges/Succès. */
  metadata?: Record<string, unknown>;
  /** Réservé aux disciplines avec feedsRankEngine = true. */
  exerciseRows?: Array<{
    name: string;
    sets?: number | null;
    reps?: number | null;
    weight?: number | null;
    image_path?: string | null;
  }>;
}

// ---- Présentation dans l'historique (contrat posé en phase 1, consommé phase 7) ----

export interface HistoryPresentation {
  /** 'strength' réutilise WorkoutCard tel quel sans aucune modification.
   *  Les futures variantes (phase 7) sont des ADDITIONS à cette union,
   *  jamais un remplacement de 'strength'. */
  cardVariant: "strength" | "metric-grid" | "guided-session";
  /** Libellés des métriques à mettre en avant, dans l'ordre d'affichage. */
  primaryMetrics: string[];
}

// ---- Contrat commun des moteurs ----

export interface EngineDescriptor {
  id: DisciplineId;
  label: string;
  /** true tant qu'aucun moteur réel n'est branché — l'UI doit afficher
   *  la discipline comme désactivée/"bientôt disponible" et ne jamais
   *  appeler generate()/toWorkoutRecord() dessus. */
  comingSoon: boolean;
  /** Frontière avec le moteur de Rang — voir en-tête de fichier. */
  feedsRankEngine: boolean;
}

export interface WorkoutEngine extends EngineDescriptor {
  comingSoon: false;
  /** Questions du dialogue Sensei propres à cette discipline (après la
   *  question méta "quelle discipline ?" posée par l'orchestrateur). */
  questions: SenseiQuestionSpec[];
  /** Génère une séance à partir des réponses collectées par le Sensei et
   *  d'un contexte optionnel calculé par l'app (voir SenseiContext). */
  generate(answers: SenseiAnswers, context?: SenseiContext): Promise<WorkoutTemplate>;
  /** Traduit un résultat généré (+ les réponses d'origine) en brouillon
   *  prêt à persister. Seul point de contact avec le schéma Supabase. */
  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft;
  historyPresentation: HistoryPresentation;
}

/** Entrée du registre : un descriptor pour toute discipline connue,
 *  enrichi en WorkoutEngine complet uniquement quand comingSoon = false. */
export type RegistryEntry = EngineDescriptor & Partial<Omit<WorkoutEngine, keyof EngineDescriptor>>;

/** Garde de type : true seulement si le moteur est réellement implémenté. */
export function isReadyEngine(entry: RegistryEntry): entry is WorkoutEngine {
  return entry.comingSoon === false && typeof entry.generate === "function";
}
