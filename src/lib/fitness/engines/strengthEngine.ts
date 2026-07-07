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
import { durationQuestion, gymLocationQuestion, levelQuestion } from "./sharedQuestions";
import type {
  SenseiAnswers,
  SenseiContext,
  SenseiQuestionSpec,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

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
      { value: "salle complète", label: "Salle complète" },
      { value: "haltères", label: "Haltères + banc" },
      { value: "élastiques", label: "Élastiques" },
      { value: "poids du corps", label: "Poids du corps" },
      { value: "kettlebell", label: "Kettlebell" },
    ],
    defaultValue: "salle complète",
  },
  levelQuestion,
  {
    id: "goal",
    prompt: "Quel est ton objectif ?",
    type: "single-choice",
    options: [
      { value: "hypertrophie", label: "Hypertrophie" },
      { value: "force", label: "Force" },
      { value: "endurance", label: "Endurance" },
      { value: "perte de poids", label: "Perte de gras" },
    ],
    defaultValue: "hypertrophie",
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
    const payload = {
      mode: "muscu",
      muscles: answers.muscles,
      has_cardio: answers.has_cardio,
      duration_minutes: Number(answers.duration_minutes) || 45,
      equipment: answers.equipment,
      level: answers.level,
      goal: answers.goal,
      // Contexte calculé par l'app (récupération musculaire), pas une
      // réponse de l'utilisateur — voir SenseiContext dans types.ts.
      recovery: context?.recovery,
    };

    const { data, error } = await supabase.functions.invoke("coach-workout", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    return toWorkoutTemplate(data as CoachWorkoutResponse);
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
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
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const rows = record.exerciseRows ?? [];
    return {
      title: record.name,
      summaryStats: [
        { label: "Durée", value: `${record.duration_minutes} min` },
        { label: "Exercices", value: String(rows.length) },
      ],
      segments: rows.map((e) => ({
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
