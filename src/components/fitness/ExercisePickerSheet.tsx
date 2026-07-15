import {
  ExerciseExplorerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExerciseExplorerSheet";
import type { DisciplineId } from "@/lib/fitness/engines/types";

export type { PickedExercise, RecentExercise };

interface Props {
  onSelect: (ex: PickedExercise) => void;
  onClose: () => void;
  recentExercises: RecentExercise[];
  initialQuery?: string;
  /** Discipline du catalogue interrogé (Phase B, 2026-07-15) — défaut
   *  "muscu". Le scan caméra IA (reconnaissance de machines de
   *  musculation) n'a de sens que pour cette discipline : désactivé
   *  automatiquement dès que `discipline` diffère. */
  discipline?: DisciplineId;
}

/**
 * Point d'entrée "Picker" du module Exercices — sélection rapide pendant la
 * construction d'une séance, TOUTE discipline confondue (Phase B). Coquille
 * fine autour d'ExerciseExplorerSheet (mode="picker") : tap sur une ligne →
 * sélection immédiate (onSelect). Le reste de l'écran (recherche, liste,
 * menu "...") est strictement identique à ExerciseCatalogSheet — plus de
 * Picker "bridé" : mêmes actions de gestion (voir la fiche, modifier,
 * promouvoir, supprimer, démarrer/ajouter à une séance) disponibles ici
 * aussi, activées/désactivées selon le contexte.
 */
export function ExercisePickerSheet({
  onSelect,
  onClose,
  recentExercises,
  initialQuery,
  discipline = "muscu",
}: Props) {
  return (
    <ExerciseExplorerSheet
      mode="picker"
      discipline={discipline}
      onClose={onClose}
      onPick={onSelect}
      recentExercises={recentExercises}
      initialQuery={initialQuery}
      enableScan={discipline === "muscu"}
    />
  );
}
