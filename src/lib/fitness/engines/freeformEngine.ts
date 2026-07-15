// ============================================================
// FreeformActivityEngine — moteur "Autre activité" (texte libre).
//
// Restaure une capacité qui existait AVANT la refonte à moteurs (via la
// branche `mode: "autre"` de l'edge function `coach-workout`, toujours
// intacte côté serveur — voir supabase/functions/coach-workout/index.ts)
// et avait disparu de l'UI depuis la Phase 2 (07/07/2026, régression
// assumée et documentée : "garder uniquement Musculation opérationnelle"
// le temps des phases 3-6). Permet de décrire n'importe quelle activité
// non cataloguée par les autres moteurs (Pilates, natation, boxe, danse,
// escalade...) en texte libre plutôt que de choisir parmi une liste
// fermée — complémentaire de GuidedActivityEngine (cours encadré connu
// à l'avance) et de CardioWorkoutEngine (familles cardio prédéfinies).
//
// Contrairement aux moteurs déterministes (Cardio/HYROX/Course/Guided),
// ce moteur APPELLE l'IA (comme StrengthWorkoutEngine) : une activité en
// texte libre n'a pas de standards connus à l'avance, contrairement à un
// poste HYROX ou une allure de course. Même edge function que la
// musculation (`coach-workout`), branche `mode: "autre"`, jamais
// modifiée par cette restauration.
//
// feedsRankEngine=false : comme toute discipline non-muscu, le contenu
// vit entièrement dans `workouts.metadata` (segments), jamais dans
// `exercises`/`exercise_sets`. Frontière Rang/Badges/Succès intouchée.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { durationQuestion, levelQuestion } from "./sharedQuestions";
import {
  baseSummaryStats,
  genericBuildLiveSegments,
  genericFormatLiveSegment,
  segmentsFromMetadata,
} from "./sessionViewHelpers";
import type {
  SenseiAnswers,
  SenseiContext,
  SenseiQuestionSpec,
  SessionSegment,
  SessionStat,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

const INTENSITY_OPTIONS = ["légère", "modérée", "intense"] as const;

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "activity",
    prompt: "Quelle activité pratiques-tu ? (ex: Pilates, natation, boxe, escalade...)",
    type: "text",
  },
  levelQuestion,
  {
    id: "intensity",
    prompt: "Quelle intensité ?",
    type: "single-choice",
    options: INTENSITY_OPTIONS.map((i) => ({ value: i, label: i })),
    defaultValue: "modérée",
  },
  durationQuestion(45),
];

interface CoachWorkoutResponse {
  name: string;
  notes?: string;
  muscles_worked?: string[];
  exercises: Array<{ name: string; sets: number; reps: number; weight?: number }>;
}

function blocksToSegments(result: CoachWorkoutResponse): SessionSegment[] {
  return (result.exercises ?? []).map((block) => {
    const stats: SessionStat[] = [
      { label: "Tours/séries", value: String(block.sets ?? 1) },
      { label: "Durée du bloc", value: `${block.reps ?? 0} min` },
    ];
    return { label: block.name, stats };
  });
}

export const FreeformActivityEngine: WorkoutEngine = {
  id: "autre",
  label: "Autre activité",
  comingSoon: false,
  feedsRankEngine: false,
  icon: "Wand2",
  accentClassName: "text-amber-400",
  // Phase A (15/07/2026) : extension du live-tracking générique
  // (pilote Course, 09/07/2026) — voir sessionViewHelpers.ts.
  supportsLiveTracking: true,
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, _context?: SenseiContext): Promise<WorkoutTemplate> {
    const activity = typeof answers.activity === "string" ? answers.activity.trim() : "";
    if (activity.length < 2) throw new Error("Décris l'activité (au moins 2 caractères).");

    const payload = {
      mode: "autre",
      activity,
      duration_minutes: Number(answers.duration_minutes) || 45,
      level: answers.level,
      intensity: answers.intensity,
    };

    const { data, error } = await supabase.functions.invoke("coach-workout", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    const result = data as CoachWorkoutResponse;
    const musclesLine =
      result.muscles_worked && result.muscles_worked.length > 0
        ? `Muscles sollicités : ${result.muscles_worked.join(", ")}.`
        : "";
    const notes = [musclesLine, result.notes].filter(Boolean).join("\n").trim();

    return {
      name: result.name,
      exercises: [],
      segments: blocksToSegments(result),
      notes: notes || undefined,
    };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    return {
      discipline: "autre",
      name: template.name,
      duration_minutes: Number(answers.duration_minutes) || 45,
      notes: template.notes,
      metadata: {
        activity: typeof answers.activity === "string" ? answers.activity.trim() : "",
        level: answers.level,
        intensity: answers.intensity,
        segments: template.segments ?? [],
      },
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const activity = typeof metadata.activity === "string" ? metadata.activity : record.name;
    const intensity = typeof metadata.intensity === "string" ? metadata.intensity : "—";

    return {
      title: record.name,
      summaryStats: baseSummaryStats(record, [
        { label: "Activité", value: activity },
        { label: "Intensité", value: intensity },
      ]),
      segments: segmentsFromMetadata(record),
      notes: record.notes,
    };
  },

  buildLiveSegments: genericBuildLiveSegments,
  formatLiveSegment: genericFormatLiveSegment,

  historyPresentation: {
    cardVariant: "metric-grid",
  },
};
