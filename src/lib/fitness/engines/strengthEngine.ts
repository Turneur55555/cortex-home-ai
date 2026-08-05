// ============================================================
// StrengthWorkoutEngine — moteur de référence (musculation).
//
// Extraction FIDÈLE de la logique qui vivait auparavant inline dans
// CoachSheet.tsx (mode "muscu"). Aucun comportement n'a changé :
// même payload envoyé à l'edge function `coach-workout`, même mise
// en forme du résultat. Seul le point d'appel a bougé, pour que
// CoachSheet dialogue avec l'interface WorkoutEngine plutôt qu'avec
// l'edge function directement — comme le feront les futurs moteurs.
//
// Ce fichier ne doit JAMAIS contenir de logique propre à une autre
// discipline (HYROX, Course, Cardio...). Toute évolution spécifique
// à la musculation (nouveaux paramètres, nouvelle question Sensei)
// vit ici et nulle part ailleurs.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { durationQuestion, gymLocationQuestion } from "./sharedQuestions";
import { buildSenseiExplanation, type SenseiAutoProfile } from "./senseiAutoProfile";
import { buildCardioRunSegment, buildHyroxPrepSegments } from "./hyroxEngine";
import { segmentsFromMetadata } from "./sessionViewHelpers";
import type {
  DisciplineId,
  SenseiAnswers,
  SenseiContext,
  SenseiQuestionSpec,
  SessionSegment,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

// Musculation hybride (2026-08-05) — Coach IA. Musculation reste la SEULE
// discipline choisie par l'utilisateur ; ce champ décide seulement si des
// blocs métriques (course/HYROX) accompagnent la séance de force, jamais
// affiché comme un mode "Hybride" séparé (une seule question de plus,
// questionnaire volontairement court). Composition, pas fusion : les blocs
// sont construits par le moteur HYROX lui-même (buildHyroxPrepSegments/
// buildCardioRunSegment, réutilisent ses standards de charge/distance par
// niveau) — StrengthWorkoutEngine ne réimplémente aucune connaissance HYROX.
export type TrainingMode = "force" | "force_cardio" | "hyrox_prep";

/** Discipline à laquelle rattacher les blocs générés pour ce training_mode
 *  (workout_segments.discipline — voir useStartHybridStrengthWorkout,
 *  use-fitness.ts). undefined pour "force" : aucun bloc, comportement
 *  100% inchangé. */
export function blockDisciplineForTrainingMode(mode: TrainingMode): DisciplineId | undefined {
  if (mode === "hyrox_prep") return "hyrox";
  if (mode === "force_cardio") return "course";
  return undefined;
}

// Niveau et objectif ne sont plus demandés : SenseiAutoProfile construit un
// véritable profil d'entraînement depuis l'historique (voir
// senseiAutoProfile.ts) et le fournit via SenseiContext (context.autoProfile),
// calculé par buildMuscuSenseiContext dans MuscleQuestionField.tsx. Repli
// défensif si le contexte manquerait (profil vide, mêmes valeurs par défaut
// que sans historique).
const FALLBACK_AUTO_PROFILE: SenseiAutoProfile = {
  level: "intermédiaire",
  goal: "hypertrophie",
  sessionsConsidered: 0,
  weeklyFrequency: 0,
  avgSessionDurationMinutes: null,
  avgRestSeconds: null,
  optimalWeeklyVolume: null,
  progressionCyclesCompleted: 0,
  muscleVolume: [],
  mostTrainedMuscles: [],
  leastTrainedMuscles: [],
  overTrainedMuscles: [],
  exerciseProgress: [],
  neverDoneExercises: [],
  recentSessions: [],
  bestProgressingExercises: [],
  chronicStagnationExercises: [],
  abandonedExercises: [],
  mostFrequentExercises: [],
  bestVariants: [],
  fatigue: { level: "faible", reasons: [] },
  weakPoints: [],
};

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "muscles",
    prompt: "Quels groupes musculaires veux-tu travailler ?",
    type: "multi-choice",
  },
  gymLocationQuestion,
  durationQuestion(45),
  {
    id: "equipment",
    prompt: "Avec quel matériel ?",
    type: "single-choice",
    options: [
      { value: "maison", label: "🏠 Maison" },
      { value: "salle avec poulies", label: "🏋️ Salle avec poulies" },
      { value: "salle complète", label: "💪 Salle complète" },
    ],
    defaultValue: "salle complète",
  },
  {
    id: "training_mode",
    prompt: "Envie d'ajouter autre chose à ta séance ?",
    type: "single-choice",
    options: [
      { value: "force", label: "Uniquement musculation" },
      { value: "force_cardio", label: "🏃 + Cardio / course" },
      { value: "hyrox_prep", label: "🔥 + Préparation HYROX" },
    ],
    defaultValue: "force",
  },
];

interface CoachWorkoutResponse {
  name: string;
  notes?: string;
  muscles_worked?: string[];
  exercises: Array<{ name: string; sets: number; reps: number; weight?: number }>;
}

function toWorkoutTemplate(result: CoachWorkoutResponse): WorkoutTemplate {
  const musclesLine =
    result.muscles_worked && result.muscles_worked.length > 0
      ? `Muscles sollicités : ${result.muscles_worked.join(", ")}.`
      : "";
  const notes = [musclesLine, result.notes].filter(Boolean).join("\n").trim();

  return {
    name: result.name,
    notes: notes || undefined,
    exercises: (result.exercises ?? []).map((ex) => ({
      name: ex.name,
      sets: String(ex.sets ?? ""),
      reps: String(ex.reps ?? ""),
      weight: ex.weight != null && ex.weight > 0 ? String(ex.weight) : "",
      image_path: null,
    })),
  };
}

export const StrengthWorkoutEngine: WorkoutEngine = {
  id: "muscu",
  label: "Musculation",
  comingSoon: false,
  feedsRankEngine: true,
  icon: "Dumbbell",
  accentClassName: "text-primary",
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, context?: SenseiContext): Promise<WorkoutTemplate> {
    const autoProfile =
      (context?.autoProfile as SenseiAutoProfile | undefined) ?? FALLBACK_AUTO_PROFILE;
    const payload = {
      mode: "muscu",
      muscles: answers.muscles,
      has_cardio: answers.has_cardio,
      duration_minutes: Number(answers.duration_minutes) || 45,
      equipment: answers.equipment,
      // Niveau et objectif ne sont plus des réponses utilisateur — voir
      // senseiAutoProfile.ts et l'en-tête de ce fichier. `training_profile`
      // porte le véritable moteur d'analyse (progression par exercice,
      // volume par groupe musculaire, durée/repos moyens...) : level/goal
      // ne restent qu'un résumé compact pour le cadrage général du prompt.
      level: autoProfile.level,
      goal: autoProfile.goal,
      training_profile: {
        sessionsConsidered: autoProfile.sessionsConsidered,
        weeklyFrequency: autoProfile.weeklyFrequency,
        avgSessionDurationMinutes: autoProfile.avgSessionDurationMinutes,
        avgRestSeconds: autoProfile.avgRestSeconds,
        optimalWeeklyVolume: autoProfile.optimalWeeklyVolume,
        progressionCyclesCompleted: autoProfile.progressionCyclesCompleted,
        mostTrainedMuscles: autoProfile.mostTrainedMuscles,
        leastTrainedMuscles: autoProfile.leastTrainedMuscles,
        overTrainedMuscles: autoProfile.overTrainedMuscles,
        exerciseProgress: autoProfile.exerciseProgress,
        neverDoneExercises: autoProfile.neverDoneExercises,
        recentSessions: autoProfile.recentSessions,
        // Mémoire à long terme (voir senseiAutoProfile.ts) + fatigue/points
        // faibles : influencent le prompt (gestion de la fatigue,
        // priorisation progressive) sans remplacer exerciseProgress, déjà
        // exhaustif par exercice — ces listes ne font que le résumer.
        bestProgressingExercises: autoProfile.bestProgressingExercises,
        chronicStagnationExercises: autoProfile.chronicStagnationExercises,
        abandonedExercises: autoProfile.abandonedExercises,
        bestVariants: autoProfile.bestVariants,
        fatigue: autoProfile.fatigue,
        weakPoints: autoProfile.weakPoints,
      },
      // Contexte calculé par l'app (récupération musculaire), pas une
      // réponse de l'utilisateur — voir SenseiContext dans types.ts.
      recovery: context?.recovery,
    };

    const { data, error } = await supabase.functions.invoke("coach-workout", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    const template = toWorkoutTemplate(data as CoachWorkoutResponse);
    // Explication basée uniquement sur les données réelles déjà calculées
    // (jamais un texte libre de l'IA) — voir buildSenseiExplanation().
    template.explanation = buildSenseiExplanation(
      autoProfile,
      template.exercises.map((e) => e.name),
    );

    // Musculation hybride — blocs métriques COMPOSÉS depuis le moteur HYROX
    // (jamais réimplémentés ici), ajoutés au template SANS toucher au
    // payload/à la génération de force ci-dessus (chemin "force" identique
    // à avant, template.segments reste undefined). autoProfile.level est la
    // même union que HyroxLevel (AutoLevel, senseiAutoProfile.ts).
    const trainingMode = (String(answers.training_mode ?? "force") as TrainingMode) || "force";
    if (trainingMode === "force_cardio") {
      template.segments = buildCardioRunSegment(autoProfile.level);
    } else if (trainingMode === "hyrox_prep") {
      template.segments = buildHyroxPrepSegments(autoProfile.level);
    }

    return template;
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    const trainingMode = (String(answers.training_mode ?? "force") as TrainingMode) || "force";
    const blockDiscipline = blockDisciplineForTrainingMode(trainingMode);
    const hasSegments = (template.segments?.length ?? 0) > 0;
    return {
      discipline: "muscu",
      name: template.name,
      duration_minutes: Number(answers.duration_minutes) || 45,
      notes: template.notes,
      gym_location: typeof answers.gym_location === "string" ? answers.gym_location : undefined,
      exerciseRows: template.exercises.map((e) => ({
        name: e.name,
        sets: e.sets ? Number(e.sets) : null,
        reps: e.reps ? Number(e.reps) : null,
        weight: e.weight ? Number(e.weight) : null,
        image_path: e.image_path,
      })),
      // Additif : absent pour toute génération "force" (comportement 100%
      // inchangé). `blockDiscipline` n'est pas un champ formel du contrat
      // WorkoutRecordDraft — lu par SeancesTab.handleCoachResult pour
      // savoir sous quelle discipline résoudre l'identité des blocs
      // (workout_segments.discipline) au démarrage de la séance active
      // hybride. Jamais lu par le moteur de Rang.
      metadata: hasSegments
        ? { segments: template.segments, sessionType: "hybrid", blockDiscipline }
        : undefined,
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const rows = record.exerciseRows ?? [];
    const blockSegments: SessionSegment[] = segmentsFromMetadata(record);
    return {
      title: record.name,
      summaryStats: [
        { label: "Durée", value: `${record.duration_minutes} min` },
        { label: "Exercices", value: String(rows.length) },
      ],
      segments: [
        ...rows.map((e) => ({
          label: e.name,
          stats: [
            { label: "Séries", value: e.sets != null ? String(e.sets) : "—" },
            { label: "Répétitions", value: e.reps != null ? String(e.reps) : "—" },
            {
              label: "Charge",
              value: e.weight != null && e.weight > 0 ? `${e.weight} kg` : "poids du corps",
            },
          ],
        })),
        // Musculation hybride : les blocs métriques (course/HYROX) suivent
        // les exercices de force, même ordre que la séance active — jamais
        // lus par le moteur de Rang (voir metadata.segments, additif).
        ...blockSegments,
      ],
      notes: record.notes,
    };
  },

  // Non consommé par l'historique aujourd'hui (cardVariant='strength' réutilise
  // WorkoutCard tel quel, sans passer par SessionView) — implémenté pour que
  // l'interface WorkoutEngine reste homogène entre toutes les disciplines.
  historyPresentation: {
    cardVariant: "strength",
  },
};
