// Réexporte les dictionnaires de traduction/alias EN<->FR pour le dataset
// externe depuis leur source unique côté Edge Functions
// (`supabase/functions/_shared/exerciseTranslations.ts`) — même convention que
// `exerciseDatasetMatching.ts` / `_shared/meals.ts`.
export {
  EXACT_NAME_TRANSLATIONS_EN_TO_FR,
  MUSCLE_TRANSLATIONS_EN_TO_FR,
  EQUIPMENT_TRANSLATIONS_EN_TO_FR,
  translateExerciseNameToFrench,
  exactTranslateExerciseName,
  translateMuscleToFrench,
  translateEquipmentToFrench,
  extractEquipmentFromFrenchLabel,
} from "../../../supabase/functions/_shared/exerciseTranslations.ts";
