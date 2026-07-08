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
//
// Phase 5 — généralisation de SenseiRuntimeInputs : avant HYROX, le 2e
// paramètre d'un ContextBuilder était figé à `Map<MuscleId,
// MuscleRecovery>` (la récupération musculaire), un concept muscu qui
// n'a AUCUN sens pour Course/Guided. C'était un couplage caché : ajouter
// une discipline qui a besoin d'un autre type de donnée d'app (ex: un
// futur snapshot wearable pour Course) aurait forcé soit à réutiliser un
// paramètre nommé "recoveryMap" pour autre chose, soit à changer la
// signature de ContextBuilder plus tard — exactement la dette que la
// Phase 5 doit éviter. `SenseiRuntimeInputs` remplace ce paramètre par un
// sac unique, extensible de façon additive (voir wearableTypes.ts) :
// chaque builder ne lit que les clés qui le concernent, CoachSheet.tsx
// construit le sac une seule fois sans connaître son contenu.
// ============================================================

import type { ReactElement } from "react";
import type { DisciplineId, SenseiAnswerValue, SenseiContext } from "@/lib/fitness/engines/types";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import type { WearableSnapshot } from "@/lib/fitness/engines/wearableTypes";
import type { AutoProfileWorkout } from "@/lib/fitness/engines/senseiAutoProfile";
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

/** Sac unique de données "app" que CoachSheet.tsx sait fournir,
 *  indépendamment de la discipline choisie. Champs additifs uniquement —
 *  en ajouter un (ex: un futur `heartRateHistory`) n'affecte aucun
 *  builder existant. `wearable` est TOUJOURS undefined aujourd'hui
 *  (aucun connecteur branché) : voir wearableTypes.ts. */
export interface SenseiRuntimeInputs {
  recoveryMap: Map<MuscleId, MuscleRecovery>;
  wearable?: WearableSnapshot;
  /** Historique de séances déjà chargé par CoachSheet.tsx (briefing) —
   *  réutilisé par le builder muscu pour déduire niveau/objectif sans
   *  refetch (voir senseiAutoProfile.ts). */
  workouts?: ReadonlyArray<AutoProfileWorkout> | null;
}

export type ContextBuilder = (
  answers: Record<string, SenseiAnswerValue>,
  inputs: SenseiRuntimeInputs,
) => SenseiContext;

export const DISCIPLINE_CONTEXT_BUILDERS: Partial<Record<DisciplineId, ContextBuilder>> = {
  muscu: (answers, inputs) =>
    buildMuscuSenseiContext(
      Array.isArray(answers.muscles) ? (answers.muscles as string[]) : [],
      inputs.recoveryMap,
      inputs.workouts,
    ),
};
