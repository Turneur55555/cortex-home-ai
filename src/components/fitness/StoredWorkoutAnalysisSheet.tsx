// ============================================================
// Relecture d'un bilan de séance depuis les Chroniques — Phase C, lot V2.
//
// "Le bilan devient une page de la chronique" (§8.2 du doc de phase) :
// ouvre le bilan IA déjà persisté d'une séance passée (muscu ou
// générique), sans AUCUN nouvel appel IA — pure lecture de
// `workout_analyses`. Même coquille et mêmes sections que le bilan
// post-clôture (WorkoutAnalysisContent), pour que rouvrir un souvenir
// procure exactement la même expérience que le vivre.
// ============================================================

import { useStoredWorkoutAnalysis } from "@/hooks/useWorkoutAnalyses";
import {
  AnalysisSheetShell,
  WorkoutAnalysisContent,
  type AnalysisVariant,
} from "./WorkoutAnalysisContent";

export function StoredWorkoutAnalysisSheet({
  workoutId,
  workoutName,
  variant,
  onClose,
}: {
  workoutId: string;
  workoutName: string;
  variant: AnalysisVariant;
  onClose: () => void;
}) {
  const { data: analysis, isLoading, error } = useStoredWorkoutAnalysis(workoutId);

  return (
    <AnalysisSheetShell
      title="Bilan de séance"
      subtitle={workoutName}
      loading={isLoading}
      error={
        error
          ? "Impossible de charger le bilan."
          : !isLoading && !analysis
            ? "Aucun bilan enregistré pour cette séance."
            : null
      }
      onClose={onClose}
    >
      {analysis && (
        <WorkoutAnalysisContent analysis={analysis} variant={variant} onClose={onClose} />
      )}
    </AnalysisSheetShell>
  );
}
