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
//
// Phase 3 : `toSessionView` donne à chaque moteur le contrôle total de
// SON résumé et SON affichage de séance (segments + stats libres), sans
// jamais exposer sa structure interne à l'UI générique. C'est le SEUL
// point de contact entre un moteur et l'affichage (Sensei "résumé après
// génération", écran de relecture avant sauvegarde, carte d'historique).
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
 *  interprété uniquement par le moteur qui le reçoit.
 *
 *  Phase 6 — séparation avec un futur "Planner Engine" (pas construit
 *  aujourd'hui, mais préparé) : c'est le SEUL moteur qui aurait le droit
 *  de "décider" quelle discipline/quels paramètres proposer (objectifs,
 *  historique, récupération, wearable, quêtes, progression RPG). Un
 *  WorkoutEngine ne décide JAMAIS lui-même quoi proposer — cette
 *  responsabilité appartient déjà exclusivement à l'utilisateur (étape
 *  "discipline" du Sensei, CoachSheet.tsx) et appartiendra demain au
 *  Planner. Le point d'injection est CE type : un Planner futur n'aurait
 *  qu'à enrichir `SenseiContext` (ex: `context.recommendation`) avant
 *  `generate()`, ou pré-remplir `answers`/`disciplineId` avant l'ouverture
 *  du Sensei (précédent déjà posé par `initialMuscles` sur CoachSheet) —
 *  aucun moteur existant n'a besoin d'être modifié pour ça. */
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
  /** Phase 5 — question facultative : le Sensei doit pouvoir avancer sans
   *  réponse (ex: FC max, pas toujours connue). Par défaut (absent/false)
   *  une question reste obligatoire, comportement 100% inchangé pour
   *  toutes les questions existantes de muscu/cardio/hyrox. Seule
   *  isAnswerValid() (QuestionRenderer.tsx) interprète ce champ. */
  optional?: boolean;
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
 *  voir `toWorkoutRecord` pour la vraie frontière de persistance.
 *
 *  `segments` (phase 4) est le pendant générique de `exercises` pour
 *  toute discipline dont le contenu généré n'est PAS une liste
 *  sets/reps/weight : Cardio, HYROX, Course, Activités accompagnées.
 *  Un moteur non-force laisse `exercises` vide et remplit `segments`
 *  (même forme que SessionSegment, réutilisée à dessein) — ce qui
 *  permet à `toWorkoutRecord`/`toSessionView` de transporter CE contenu
 *  tel quel jusqu'à l'écran de relecture et l'historique, sans jamais
 *  le forcer dans le vocabulaire "exercice" de la musculation. Voir
 *  sessionViewHelpers.ts pour la convention de stockage dans metadata. */
export interface WorkoutTemplate {
  name: string;
  exercises: WorkoutTemplateExercise[];
  segments?: SessionSegment[];
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

// ---- Affichage générique d'une séance (posé phase 1 sous forme de
// HistoryPresentation, complété phase 3 avec un vrai contrat de rendu) ----

/** Une statistique affichable : "Distance" / "5.2 km". Format 100% texte —
 *  chaque moteur décide lui-même des unités et de la mise en forme. */
export interface SessionStat {
  label: string;
  value: string;
}

/** Un bloc de la séance (un exercice en musculation, une station HYROX,
 *  un fractionné en course, l'activité unique en cardio...). Le nom
 *  générique "segment" est délibéré : aucune discipline n'impose son
 *  vocabulaire aux autres. */
export interface SessionSegment {
  label: string;
  stats: SessionStat[];
}

/** Représentation 100% générique d'une séance, consommée par UN SEUL jeu
 *  de composants UI (src/components/fitness/session/) pour : l'écran de
 *  relecture avant sauvegarde, le résumé Sensei et la carte d'historique.
 *  Construite soit depuis un WorkoutTemplate frais (avant sauvegarde),
 *  soit depuis une ligne `workouts` persistée relue en base — les deux
 *  passent par `toWorkoutRecord`/la lecture DB puis par `toSessionView`. */
export interface SessionView {
  title: string;
  /** Stats mises en avant en haut de carte (durée, tonnage, distance...). */
  summaryStats: SessionStat[];
  segments: SessionSegment[];
  notes?: string;
}

// ---- Présentation dans l'historique ----

export interface HistoryPresentation {
  /** 'strength' réutilise WorkoutCard tel quel sans aucune modification —
   *  c'est la SEULE variante qui contourne SessionView, pour ne rien
   *  casser sur la musculation. Toute autre discipline utilise
   *  'metric-grid' (métriques en grille) ou 'guided-session' (cours
   *  encadré, pas de programmation générée) et passe par le kit UI
   *  générique alimenté par `toSessionView`. */
  cardVariant: "strength" | "metric-grid" | "guided-session";
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
  /** Phase 7 — identité visuelle : CHAQUE moteur possède sa propre icône
   *  et sa propre couleur d'accent, pour qu'une séance soit identifiable
   *  au premier coup d'œil dans l'historique, avant même de l'ouvrir.
   *  `icon` est un NOM d'icône Lucide (string, pas un composant) — /lib/
   *  fitness reste 100% pur, zéro import React ; c'est à la couche UI
   *  (voir src/components/fitness/session/DisciplineIcon.tsx) de résoudre
   *  ce nom en composant réel. Un seul résolveur, jamais un import Lucide
   *  direct dans un moteur. `accentClassName` est une classe Tailwind
   *  (texte/anneau) — même logique, décidée par le moteur, appliquée
   *  telle quelle par l'UI générique. */
  icon: string;
  accentClassName: string;
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
  /** Construit la représentation d'affichage générique d'une séance, à
   *  partir d'un brouillon (avant sauvegarde) OU d'une ligne persistée
   *  relue en base (même forme structurelle — voir WorkoutRecordDraft).
   *  Unique point de contact entre ce moteur et le kit UI générique. */
  toSessionView(record: WorkoutRecordDraft): SessionView;
  historyPresentation: HistoryPresentation;
}

/** Entrée du registre : un descriptor pour toute discipline connue,
 *  enrichi en WorkoutEngine complet uniquement quand comingSoon = false. */
export type RegistryEntry = EngineDescriptor & Partial<Omit<WorkoutEngine, keyof EngineDescriptor>>;

/** Garde de type : true seulement si le moteur est réellement implémenté. */
export function isReadyEngine(entry: RegistryEntry): entry is WorkoutEngine {
  return entry.comingSoon === false && typeof entry.generate === "function";
}
