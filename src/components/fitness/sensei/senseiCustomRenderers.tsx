// ============================================================
// Registre des points d'extension UI du Sensei conversationnel.
//
// Deux registres, tous deux OPTIONNELS et keyés par discipline (ou
// "discipline.questionId") : ajouter une entrée pour une nouvelle
// discipline n'affecte JAMAIS les entrées existantes (Open/Closed).
// L'orchestrateur (CoachSheet.tsx) ne connaît que ces registres,
// jamais les moteurs ou leurs concepts internes directement.
//
// 1. CUSTOM_QUESTION_RENDERERS — pour les questions qui ont besoin
//    d'un widget dédié plutôt que du rendu générique par `type`
//    (ex: sélection de muscles avec état de récupération). Une
//    discipline sans entrée ici utilise entièrement le rendu
//    générique (QuestionRenderer.tsx).
//
// 2. DISCIPLINE_CONTEXT_BUILDERS — pour le SenseiContext (données
//    calculées par l'app, jamais des réponses utilisateur) que
//    l'orchestrateur passe à `engine.generate(answers, context)`.
// ============================================================

import type { ReactElement } from "react";
import type { DisciplineId, SenseiAnswerValue, SenseiContext } from "@/lib/fitness/engines/types";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { MuscleQuestionField, buildMuscuSenseiContext } from "./MuscleQuestionField";

export type CustomQuestionRendererProps = {
  value: SenseiAnswerValue;
  onChange: (value: SenseiAnswerValue) => void;
  recoveryMap: Map<MuscleId, MuscleRecovery>;
};

export type CustomQuestionRenderer = (props: CustomQuestionRendererProps) => ReactElement;

export const CUSTOM_QUESTION_RENDERERS: Record<string, CustomQuestionRenderer> = {
  "muscu.muscles": ({ value, onChange, recoveryMap }) => (
    <MuscleQuestionField
      value={Array.isArray(value) ? value : []}
      onChange={onChange}
      recoveryMap={recoveryMap}
    />
  ),
};

export type ContextBuilder = (
  answers: Record<string, SenseiAnswerValue>,
  recoveryMap: Map<MuscleId, MuscleRecovery>,
) => SenseiContext;

export const DISCIPLINE_CONTEXT_BUILDERS: Partial<Record<DisciplineId, ContextBuilder>> = {
  muscu: (answers, recoveryMap) =>
    buildMuscuSenseiContext(
      Array.isArray(answers.muscles) ? (answers.muscles as string[]) : [],
      recoveryMap,
    ),
};
